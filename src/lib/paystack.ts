import axios from "axios";
import { createHmac, timingSafeEqual } from "crypto";

// Thin wrapper around the Paystack REST API — covers the two calls the
// payment-integrity + commission-engine flow needs (PRD sections 5.2, 5.3, 8.1).
// Docs: https://paystack.com/docs/api/

const paystack = axios.create({
  baseURL: "https://api.paystack.co",
  headers: {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
});

/**
 * Create a Paystack subaccount for a staff member so their share of a
 * digital payment can be settled directly via Transaction Splits, instead
 * of the owner manually paying them out later.
 */
export async function createStaffSubaccount(params: {
  businessName: string;
  bankCode: string;
  accountNumber: string;
  // Fallback default only. Every real checkout in this app overrides this
  // per-transaction via initializeSplitTransaction's ownerShareKobo, computed
  // fresh from calculateSplit() each time — so this value never actually
  // decides a real payout. It exists because Paystack requires some value at
  // subaccount creation, and matters only if a transaction were ever
  // initialized without the override (not a path this app takes).
  percentageCharge: number;
}) {
  const { data } = await paystack.post("/subaccount", {
    business_name: params.businessName,
    bank_code: params.bankCode,
    account_number: params.accountNumber,
    percentage_charge: params.percentageCharge,
  });
  return data; // data.data.subaccount_code -> store on Staff.paystackSubaccountCode
}

/**
 * Initialize a checkout charge that splits between the salon's main account
 * and the staff member's subaccount.
 */
export async function initializeSplitTransaction(params: {
  // Paystack requires a customer email even for a phone-first flow. Use a
  // placeholder built from the phone number, but NOT a `.local` domain —
  // confirmed live against Paystack's API: it's rejected outright with
  // "Invalid Email Address Passed" (400), because .local is RFC 6762 mDNS
  // space, not a real TLD. Any real TLD works even though nothing is
  // actually deliverable to it; see the placeholder in
  // src/app/api/transactions/paystack/initialize/route.ts for the pattern
  // in use.
  email: string;
  amountKobo: number; // Paystack amounts are in kobo (amount * 100)
  subaccountCode: string;
  // Flat kobo amount routed to the MAIN (owner) account for this one
  // transaction, overriding the subaccount's stored percentage_charge
  // entirely for that transaction. Confirmed against Paystack's own docs
  // (PaystackHQ/documentation, receiving-payments/split-payments.md):
  // "transaction_charge = 1000 //amount in kobo" — it is a flat amount, not
  // a percentage. A previous version of this parameter was named
  // transactionChargePercent and documented as one; that was wrong, and
  // luckily never actually wired up anywhere, or every split payment would
  // have sent the subaccount roughly the entire amount regardless of the
  // intended commission — passing what was meant as "20" (percent) would
  // have been read as 20 kobo (₦0.20) going to the owner.
  //
  // Always pass this explicitly — see calculateSplit() in
  // src/lib/commission.ts, which is the one place that decides how much
  // anyone is owed. Without it, Paystack falls back to the subaccount's
  // stored percentage_charge, which is only ever correct for PERCENT-type
  // commission rules that haven't changed since the subaccount was created;
  // it cannot represent FLAT or CHAIR_RENTAL at all, since those are a fixed
  // naira amount whose equivalent percentage is different for every service
  // price.
  ownerShareKobo: number;
  reference: string; // your own appointmentId/transactionId, for reconciliation
  callbackUrl?: string; // where Paystack redirects after payment
}) {
  const { data } = await paystack.post("/transaction/initialize", {
    email: params.email,
    amount: params.amountKobo,
    subaccount: params.subaccountCode,
    transaction_charge: params.ownerShareKobo,
    reference: params.reference,
    callback_url: params.callbackUrl,
  });
  return data; // data.data.authorization_url -> redirect/open for the customer to pay
}

/**
 * Initialize a plain (non-split) charge to the salon's own Paystack account —
 * used only for deposits (src/app/api/public/book/[id]/deposit/route.ts).
 *
 * Deliberately never split via subaccount: splitting a FLAT/CHAIR_RENTAL
 * commission rule's fixed amount across two separate payments (a deposit now,
 * the balance at checkout) does not sum to the same result as computing it
 * once on the full price — see calculateSplit() in src/lib/commission.ts and
 * the comment on Deposit in prisma/schema.prisma. The full commission split
 * still happens exactly once, at final checkout, on the true total collected.
 */
export async function initializeTransaction(params: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl?: string;
}) {
  const { data } = await paystack.post("/transaction/initialize", {
    email: params.email,
    amount: params.amountKobo,
    reference: params.reference,
    callback_url: params.callbackUrl,
  });
  return data; // data.data.authorization_url -> redirect/open for the customer to pay
}

/** Confirm a transaction actually settled before marking an appointment paid. */
export async function verifyTransaction(reference: string) {
  const { data } = await paystack.get(`/transaction/verify/${reference}`);
  return data;
}

/**
 * One-off, run manually via a script during setup, not called from any
 * route — creates the real Paystack Plan for the subscription price. The
 * resulting plan_code goes in PAYSTACK_PLAN_CODE; nothing in the app
 * creates a Plan on the fly, same "verify externally, don't assume"
 * approach as every other Paystack integration here.
 */
export async function createPlan(params: { name: string; amountKobo: number; interval: "monthly" }) {
  const { data } = await paystack.post("/plan", {
    name: params.name,
    amount: params.amountKobo,
    interval: params.interval,
  });
  return data; // data.data.plan_code -> PAYSTACK_PLAN_CODE
}

/**
 * Initialize a subscription charge — src/app/api/billing/subscribe. Passing
 * `plan` to /transaction/initialize creates the Paystack subscription
 * automatically once this first charge succeeds (no separate /subscription
 * call needed for the common case); every renewal after that is Paystack
 * charging the same card on its own and firing charge.success /
 * subscription.disable webhooks — see src/app/api/webhooks/paystack.
 */
export async function initializeSubscriptionTransaction(params: {
  email: string;
  amountKobo: number;
  plan: string;
  reference: string;
  callbackUrl?: string;
}) {
  const { data } = await paystack.post("/transaction/initialize", {
    email: params.email,
    amount: params.amountKobo,
    plan: params.plan,
    reference: params.reference,
    callback_url: params.callbackUrl,
  });
  return data; // data.data.authorization_url -> redirect/open for the owner to pay
}

/**
 * Verifies Paystack's x-paystack-signature header: HMAC-SHA512 of the raw
 * request body using PAYSTACK_SECRET_KEY. node:crypto rather than a
 * dependency, same reasoning as src/lib/password.ts and src/lib/session.ts.
 *
 * Takes the raw body STRING, not a parsed object — the signature is over
 * the exact bytes Paystack sent, and re-serializing a parsed JSON object
 * is not guaranteed to reproduce them byte-for-byte (key order, spacing).
 * Callers must read the raw request body before parsing it as JSON.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !process.env.PAYSTACK_SECRET_KEY) return false;
  const expected = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const signatureBuf = Buffer.from(signature, "hex");
  // timingSafeEqual throws on length mismatch rather than returning false,
  // so a malformed signature has to be rejected before the call.
  if (expectedBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(expectedBuf, signatureBuf);
}

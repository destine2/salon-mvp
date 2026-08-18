import axios from "axios";

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

/** Confirm a transaction actually settled before marking an appointment paid. */
export async function verifyTransaction(reference: string) {
  const { data } = await paystack.get(`/transaction/verify/${reference}`);
  return data;
}

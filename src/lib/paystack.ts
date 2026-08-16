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
  /** Percentage the MAIN account (salon owner) keeps by default. Overridden per-transaction if needed. */
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
 * Initialize a checkout charge that automatically splits between the salon's
 * main account and the staff member's subaccount at the agreed commission rate.
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
  transactionChargePercent?: number; // overrides the subaccount's default split for this one transaction
  reference: string; // your own appointmentId/transactionId, for reconciliation
  callbackUrl?: string; // where Paystack redirects after payment
}) {
  const { data } = await paystack.post("/transaction/initialize", {
    email: params.email,
    amount: params.amountKobo,
    subaccount: params.subaccountCode,
    transaction_charge: params.transactionChargePercent,
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

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnerSession } from "@/lib/require-owner";
import { initializeSubscriptionTransaction } from "@/lib/paystack";
import { SUBSCRIPTION_PRICE_NAIRA } from "@/lib/billing";

// Owner-only — starts (or restarts, after a lapse) the salon's subscription.
// Passing `plan` to Paystack's /transaction/initialize creates the actual
// Paystack Subscription once this first charge succeeds; every renewal after
// that is Paystack charging the same card automatically and firing webhooks
// (see /api/webhooks/paystack) — nothing in this route runs again for a
// renewal.
export async function POST() {
  const { session, error } = requireOwnerSession();
  if (error) return error;

  if (!process.env.PAYSTACK_PLAN_CODE) {
    return NextResponse.json({ ok: false, error: "Billing isn't configured yet — contact support." }, { status: 500 });
  }

  const owner = await prisma.staff.findUnique({ where: { id: session!.staffId } });
  if (!owner) {
    return NextResponse.json({ ok: false, error: "Staff record not found" }, { status: 404 });
  }

  // Same placeholder-email reasoning as every other Paystack checkout in
  // this app — Paystack requires one, rejects the ".local" TLD outright,
  // and the owner is never actually emailed at this address.
  const placeholderEmail = `${owner.phone}@customer.salon-mvp.com`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // A fresh reference per attempt (not a stable one keyed on salonId) —
  // unlike a one-shot checkout, an owner might reasonably retry this more
  // than once (e.g. after a declined card), and reusing the same reference
  // would collide on Paystack's side.
  const reference = `sub_${session!.salonId}_${Date.now()}`;

  let result;
  try {
    result = await initializeSubscriptionTransaction({
      email: placeholderEmail,
      amountKobo: Math.round(SUBSCRIPTION_PRICE_NAIRA * 100),
      plan: process.env.PAYSTACK_PLAN_CODE,
      reference,
      callbackUrl: `${appUrl}/dashboard/billing`,
    });
  } catch (error) {
    const message =
      (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
      (error instanceof Error ? error.message : "Paystack could not start this payment.");
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  if (!result?.status) {
    return NextResponse.json({ ok: false, error: result?.message ?? "Paystack could not start this payment." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, authorizationUrl: result.data.authorization_url });
}

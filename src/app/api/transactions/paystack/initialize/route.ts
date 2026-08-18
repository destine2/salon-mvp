import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { initializeSplitTransaction } from "@/lib/paystack";
import { calculateSplit } from "@/lib/commission";

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });

  const { appointmentId } = await req.json();
  if (!appointmentId) {
    return NextResponse.json({ ok: false, error: "appointmentId is required" }, { status: 400 });
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { service: true, staff: { include: { commissionRule: true } }, customer: true, transaction: true },
  });
  if (!appointment || appointment.salonId !== session.salonId) {
    return NextResponse.json({ ok: false, error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.transaction) {
    return NextResponse.json({ ok: false, error: "This appointment has already been checked out." }, { status: 409 });
  }
  if (!appointment.staff.paystackSubaccountCode) {
    return NextResponse.json(
      { ok: false, error: "Set up payouts for this staff member first (Staff page → Set up payouts)." },
      { status: 400 }
    );
  }

  // Reference doubles as the appointmentId so /paystack/verify can look the
  // appointment straight back up. Known MVP limitation: retrying a failed
  // Paystack init for the same appointment will collide on this reference —
  // fine at pilot scale, worth a proper unique-reference scheme before scale.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Paystack rejects reserved/non-routable TLDs outright — verified live:
  // "@...local" fails with "Invalid Email Address Passed" (400) on every
  // single call, so every card/transfer checkout in the app was broken
  // before this fix. ".local" is RFC 6762 mDNS space, not a real TLD;
  // Paystack's validator (correctly) doesn't accept it. ".com" is not
  // deliverable either, but it satisfies validation, which is all this
  // placeholder needs to do — the customer is never actually emailed.
  const placeholderEmail = `${appointment.customer.phone}@customer.salon-mvp.com`;

  // The one place that decides who is owed what is calculateSplit() — used
  // here to decide what Paystack actually pays out, and again at verify time
  // to decide what gets recorded for reporting. Using it in both places with
  // the same inputs (the fixed service price, the commission rule) is what
  // keeps "what was actually paid" and "what the dashboard shows" from
  // disagreeing — they were previously computed by two different mechanisms
  // (Paystack's stored subaccount percentage vs. this function), which could
  // silently diverge for any commission type other than PERCENT, or for any
  // PERCENT rule edited after the subaccount was first set up.
  const servicePriceNaira = Number(appointment.service.priceNaira);
  const rule = appointment.staff.commissionRule;
  const split = rule ? calculateSplit(rule, servicePriceNaira) : { ownerShare: servicePriceNaira, staffShare: 0 };

  let result;
  try {
    result = await initializeSplitTransaction({
      email: placeholderEmail,
      amountKobo: Math.round(servicePriceNaira * 100),
      subaccountCode: appointment.staff.paystackSubaccountCode,
      ownerShareKobo: Math.round(split.ownerShare * 100),
      reference: appointment.id,
      callbackUrl: `${appUrl}/checkout/paystack-callback`,
    });
  } catch (error) {
    // axios throws on any 4xx/5xx by default, so an unhandled call here
    // — confirmed live against the .local bug above — reaches this route as
    // an unhandled rejection and Next.js turns it into a raw 500. The
    // `if (!result?.status)` check below only ever fires for the (rarer)
    // case where Paystack itself responds 200 with a soft failure body;
    // this catch is what makes an actual HTTP-level rejection degrade to
    // the same clean error response instead of crashing.
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

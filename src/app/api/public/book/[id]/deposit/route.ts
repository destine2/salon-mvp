import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { initializeTransaction } from "@/lib/paystack";

// Public, unauthenticated — initializes payment for the deposit created
// alongside a HELD appointment (see /api/public/book). Plain, non-split
// charge to the salon's own account; see the comment on initializeTransaction
// in src/lib/paystack.ts for why this never goes through a staff subaccount.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: params.id },
    include: { customer: true, deposit: true },
  });
  if (!appointment) {
    return NextResponse.json({ ok: false, error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.status !== "HELD" || !appointment.deposit) {
    return NextResponse.json({ ok: false, error: "This booking doesn't have a pending deposit." }, { status: 400 });
  }
  if (appointment.holdExpiresAt && appointment.holdExpiresAt.getTime() < Date.now()) {
    return NextResponse.json(
      { ok: false, error: "This hold has expired — please pick a time and book again." },
      { status: 409 }
    );
  }
  if (appointment.deposit.status === "PAID") {
    return NextResponse.json({ ok: false, error: "This deposit has already been paid." }, { status: 409 });
  }

  // Same placeholder-email reasoning as the checkout initialize route —
  // Paystack rejects the ".local" TLD outright but accepts ".com", which is
  // all validation needs; the customer is never actually emailed.
  const placeholderEmail = `${appointment.customer.phone}@customer.salon-mvp.com`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  let result;
  try {
    result = await initializeTransaction({
      email: placeholderEmail,
      amountKobo: Math.round(Number(appointment.deposit.amountNaira) * 100),
      // The deposit reference is distinct from the appointmentId (used as
      // the checkout reference elsewhere) so the two payment events for one
      // appointment never collide on Paystack's side.
      reference: `deposit_${appointment.id}`,
      callbackUrl: `${appUrl}/book/deposit-callback`,
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

  await prisma.deposit.update({
    where: { appointmentId: appointment.id },
    data: { paystackRef: `deposit_${appointment.id}` },
  });

  return NextResponse.json({ ok: true, authorizationUrl: result.data.authorization_url });
}

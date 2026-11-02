import { NextRequest, NextResponse } from "next/server";
import { verifyTransaction } from "@/lib/paystack";
import { sendBookingConfirmed } from "@/lib/notifications";
import { findSalonIdByAppointmentId, withTenant } from "@/lib/tenant";

// Public, unauthenticated — where the customer's browser lands after paying
// a deposit (called from /book/deposit-callback). Never trusts the redirect
// itself as proof of payment, same rule as the checkout verify route: only a
// server-side call to Paystack's own /transaction/verify counts.
export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get("reference");
  if (!reference || !reference.startsWith("deposit_")) {
    return NextResponse.json({ ok: false, error: "reference is required" }, { status: 400 });
  }
  const appointmentId = reference.slice("deposit_".length);

  const salonId = await findSalonIdByAppointmentId(appointmentId);
  if (!salonId) {
    return NextResponse.json({ ok: false, error: "Booking not found for this reference" }, { status: 404 });
  }

  const appointment = await withTenant(salonId, (tx) =>
    tx.appointment.findUnique({
      where: { id: appointmentId },
      include: { deposit: true },
    })
  );
  if (!appointment || !appointment.deposit) {
    return NextResponse.json({ ok: false, error: "Booking not found for this reference" }, { status: 404 });
  }

  // Already processed (e.g. the customer refreshed the callback page).
  if (appointment.deposit.status === "PAID") {
    return NextResponse.json({ ok: true, alreadyProcessed: true });
  }

  const result = await verifyTransaction(reference);
  if (!result?.status || result.data?.status !== "success") {
    return NextResponse.json({ ok: false, error: "Payment was not successful." }, { status: 402 });
  }

  if (appointment.status !== "HELD") {
    // The hold already expired and was swept, or something else moved this
    // appointment on — Paystack still took the customer's money, so this is
    // reported plainly rather than silently discarded; the owner can see it
    // via the deposit's paystackRef and sort it out manually.
    return NextResponse.json(
      { ok: false, error: "This hold is no longer active — the slot may have been released. Contact the salon." },
      { status: 409 }
    );
  }

  await withTenant(salonId, async (tx) => {
    await tx.deposit.update({ where: { appointmentId: appointment.id }, data: { status: "PAID" } });
    await tx.appointment.update({
      where: { id: appointment.id },
      data: { status: "BOOKED", holdExpiresAt: null },
    });
  });

  await sendBookingConfirmed(salonId, appointment.id);

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTransaction } from "@/lib/paystack";

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

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { deposit: true },
  });
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

  await prisma.$transaction([
    prisma.deposit.update({ where: { appointmentId: appointment.id }, data: { status: "PAID" } }),
    prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: "BOOKED", holdExpiresAt: null },
    }),
  ]);

  return NextResponse.json({ ok: true });
}

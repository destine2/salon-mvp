import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { initializeSplitTransaction } from "@/lib/paystack";

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });

  const { appointmentId } = await req.json();
  if (!appointmentId) {
    return NextResponse.json({ ok: false, error: "appointmentId is required" }, { status: 400 });
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { service: true, staff: true, customer: true, transaction: true },
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

  const result = await initializeSplitTransaction({
    email: `${appointment.customer.phone}@salon-mvp.local`,
    amountKobo: Math.round(Number(appointment.service.priceNaira) * 100),
    subaccountCode: appointment.staff.paystackSubaccountCode,
    reference: appointment.id,
    callbackUrl: `${appUrl}/checkout/paystack-callback`,
  });

  if (!result?.status) {
    return NextResponse.json({ ok: false, error: result?.message ?? "Paystack could not start this payment." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, authorizationUrl: result.data.authorization_url });
}

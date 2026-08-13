import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSlotAvailable } from "@/lib/scheduling";

// Public, unauthenticated — the actual booking submit from the customer
// booking page (PRD 7.1, steps 1-3). No session required; this is the
// no-app-download path a customer reaches via the WhatsApp link.
export async function POST(req: NextRequest) {
  const { salonId, staffId, serviceId, startTime, customerName, customerPhone } = await req.json();

  if (!salonId || !staffId || !serviceId || !startTime || !customerPhone) {
    return NextResponse.json(
      { ok: false, error: "salonId, staffId, serviceId, startTime, and customerPhone are required" },
      { status: 400 }
    );
  }

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service || service.salonId !== salonId) {
    return NextResponse.json({ ok: false, error: "Service not found" }, { status: 404 });
  }

  const staff = await prisma.staff.findUnique({ where: { id: staffId } });
  if (!staff || staff.salonId !== salonId) {
    return NextResponse.json({ ok: false, error: "Staff member not found" }, { status: 404 });
  }

  const start = new Date(startTime);
  const available = await isSlotAvailable({ staffId, startTime: start, durationMin: service.durationMin });
  if (!available) {
    return NextResponse.json(
      { ok: false, error: "Sorry, that slot was just taken — please pick another time." },
      { status: 409 }
    );
  }

  const customer = await prisma.customer.upsert({
    where: { salonId_phone: { salonId, phone: customerPhone } },
    update: { name: customerName ?? undefined },
    create: { salonId, phone: customerPhone, name: customerName ?? null },
  });

  const appointment = await prisma.appointment.create({
    data: {
      salonId,
      staffId,
      customerId: customer.id,
      serviceId,
      startTime: start,
      isWalkIn: false,
      status: "BOOKED",
    },
  });

  return NextResponse.json({ ok: true, appointmentId: appointment.id });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isSlotAvailable } from "@/lib/scheduling";
import { appointmentEndTime, isSlotConflictError } from "@/lib/overlap";

const SLOT_TAKEN = "That staff member already has an appointment at that time.";

// Owner/staff-side appointment list + creation (walk-ins and manual
// bookings). The customer-facing WhatsApp-link flow is separate —
// see src/app/api/public/book/route.ts.

export async function GET(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });

  const dateParam = req.nextUrl.searchParams.get("date");
  const date = dateParam ? new Date(dateParam) : new Date();
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const appointments = await prisma.appointment.findMany({
    where: { salonId: session.salonId, startTime: { gte: dayStart, lt: dayEnd } },
    include: { staff: true, customer: true, service: true, transaction: true },
    orderBy: [{ staffId: "asc" }, { startTime: "asc" }],
  });

  return NextResponse.json({ ok: true, appointments });
}

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });

  const { staffId, serviceId, startTime, customerName, customerPhone, isWalkIn } = await req.json();
  if (!staffId || !serviceId || !startTime || !customerPhone) {
    return NextResponse.json(
      { ok: false, error: "staffId, serviceId, startTime, and customerPhone are required" },
      { status: 400 }
    );
  }

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service || service.salonId !== session.salonId) {
    return NextResponse.json({ ok: false, error: "Service not found" }, { status: 404 });
  }

  const start = new Date(startTime);
  const available = await isSlotAvailable({ staffId, startTime: start, durationMin: service.durationMin });
  if (!available) {
    return NextResponse.json(
      { ok: false, error: "That staff member already has an appointment at that time." },
      { status: 409 }
    );
  }

  const customer = await prisma.customer.upsert({
    where: { salonId_phone: { salonId: session.salonId, phone: customerPhone } },
    update: { name: customerName ?? undefined },
    create: { salonId: session.salonId, phone: customerPhone, name: customerName ?? null },
  });

  // Pre-check above is advisory; the exclusion constraint is what actually
  // prevents two staff booking the same chair at once — including when the
  // offline queue replays several writes on reconnect.
  try {
    const appointment = await prisma.appointment.create({
      data: {
        salonId: session.salonId,
        staffId,
        customerId: customer.id,
        serviceId,
        startTime: start,
        endTime: appointmentEndTime(start, service.durationMin),
        isWalkIn: Boolean(isWalkIn),
        status: isWalkIn ? "CONFIRMED" : "BOOKED",
      },
      include: { staff: true, customer: true, service: true },
    });
    return NextResponse.json({ ok: true, appointment });
  } catch (error) {
    if (isSlotConflictError(error)) {
      return NextResponse.json({ ok: false, error: SLOT_TAKEN }, { status: 409 });
    }
    throw error;
  }
}

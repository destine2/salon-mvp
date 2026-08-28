import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSlotAvailable } from "@/lib/scheduling";
import { appointmentEndTime, isSlotConflictError } from "@/lib/overlap";

const SLOT_TAKEN = "Sorry, that slot was just taken — please pick another time.";

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

  const salon = await prisma.salon.findUnique({ where: { id: salonId } });
  if (!salon) {
    return NextResponse.json({ ok: false, error: "Salon not found" }, { status: 404 });
  }

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service || service.salonId !== salonId) {
    return NextResponse.json({ ok: false, error: "Service not found" }, { status: 404 });
  }

  const staff = await prisma.staff.findUnique({ where: { id: staffId } });
  if (!staff || staff.salonId !== salonId) {
    return NextResponse.json({ ok: false, error: "Staff member not found" }, { status: 404 });
  }
  // The booking page only ever offers active staff (see /api/public/salons),
  // so this only fires against a stale page or a direct API call — but it's
  // the actual enforcement point, not the dropdown filter.
  if (!staff.active) {
    return NextResponse.json({ ok: false, error: "This staff member is no longer taking bookings." }, { status: 409 });
  }

  const start = new Date(startTime);
  const available = await isSlotAvailable({ staffId, startTime: start, durationMin: service.durationMin });
  if (!available) {
    return NextResponse.json({ ok: false, error: SLOT_TAKEN }, { status: 409 });
  }

  const customer = await prisma.customer.upsert({
    where: { salonId_phone: { salonId, phone: customerPhone } },
    update: { name: customerName ?? undefined },
    create: { salonId, phone: customerPhone, name: customerName ?? null },
  });

  // Opt-in per salon (Salon.depositPercent, default 0) — an existing salon
  // that never turns this on keeps exactly today's behavior: straight to
  // BOOKED, pay at checkout. Only a salon that sets a percentage above 0
  // gets the hold-then-pay-a-deposit flow.
  const requiresDeposit = salon.depositPercent > 0;
  const servicePriceNaira = Number(service.priceNaira);
  const depositAmountNaira = requiresDeposit ? Math.round(servicePriceNaira * salon.depositPercent) / 100 : 0;
  const HOLD_MINUTES = 10;

  // The check above can be overtaken by a concurrent booking, so the database
  // constraint is the real arbiter. Losing that race is an ordinary outcome,
  // not a server fault — report it as the same 409 the pre-check returns.
  try {
    const appointment = await prisma.appointment.create({
      data: {
        salonId,
        staffId,
        customerId: customer.id,
        serviceId,
        startTime: start,
        endTime: appointmentEndTime(start, service.durationMin),
        isWalkIn: false,
        status: requiresDeposit ? "HELD" : "BOOKED",
        holdExpiresAt: requiresDeposit ? new Date(Date.now() + HOLD_MINUTES * 60_000) : null,
        ...(requiresDeposit
          ? { deposit: { create: { amountNaira: depositAmountNaira, status: "PENDING" } } }
          : {}),
      },
    });
    return NextResponse.json({
      ok: true,
      appointmentId: appointment.id,
      requiresDeposit,
      depositAmountNaira: requiresDeposit ? depositAmountNaira : undefined,
    });
  } catch (error) {
    if (isSlotConflictError(error)) {
      return NextResponse.json({ ok: false, error: SLOT_TAKEN }, { status: 409 });
    }
    throw error;
  }
}

import { NextRequest, NextResponse } from "next/server";
import { isSlotAvailable } from "@/lib/scheduling";
import { appointmentEndTime, isSlotConflictError } from "@/lib/overlap";
import { withTenant } from "@/lib/tenant";
import { parseIntake } from "@/lib/intake";
import { isValidEmail } from "@/lib/email";
import { sendBookingConfirmed } from "@/lib/notifications";

const SLOT_TAKEN = "Sorry, that slot was just taken — please pick another time.";

// Public, unauthenticated — the actual booking submit from the customer
// booking page (PRD 7.1, steps 1-3). No session required; this is the
// no-app-download path a customer reaches via the WhatsApp link.
export async function POST(req: NextRequest) {
  const { salonId, staffId, serviceId, startTime, customerName, customerPhone, customerEmail: rawEmail, intake: rawIntake } = await req.json();
  const intake = parseIntake(rawIntake);
  const customerEmail = isValidEmail(rawEmail) ? rawEmail.trim().toLowerCase() : null;

  if (!salonId || !staffId || !serviceId || !startTime || !customerPhone) {
    return NextResponse.json(
      { ok: false, error: "salonId, staffId, serviceId, startTime, and customerPhone are required" },
      { status: 400 }
    );
  }

  const result = await withTenant(salonId, async (tx) => {
    const salon = await tx.salon.findUnique({ where: { id: salonId } });
    if (!salon) {
      return "salon-not-found" as const;
    }

    const service = await tx.service.findUnique({ where: { id: serviceId } });
    if (!service || service.salonId !== salonId) {
      return "service-not-found" as const;
    }

    const staff = await tx.staff.findUnique({ where: { id: staffId } });
    if (!staff || staff.salonId !== salonId) {
      return "staff-not-found" as const;
    }
    // The booking page only ever offers active staff (see /api/public/salons),
    // so this only fires against a stale page or a direct API call — but it's
    // the actual enforcement point, not the dropdown filter.
    if (!staff.active) {
      return "staff-inactive" as const;
    }

    const start = new Date(startTime);
    const available = await isSlotAvailable(tx, { staffId, startTime: start, durationMin: service.durationMin });
    if (!available) {
      return "slot-taken" as const;
    }

    const customer = await tx.customer.upsert({
      where: { salonId_phone: { salonId, phone: customerPhone } },
      update: { name: customerName ?? undefined, ...(customerEmail ? { email: customerEmail } : {}) },
      create: { salonId, phone: customerPhone, name: customerName ?? null, email: customerEmail },
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
      const appointment = await tx.appointment.create({
        data: {
          salonId,
          staffId,
          customerId: customer.id,
          serviceId,
          startTime: start,
          endTime: appointmentEndTime(start, service.durationMin),
          isWalkIn: false,
          ...(intake ? { intake } : {}),
          status: requiresDeposit ? "HELD" : "BOOKED",
          holdExpiresAt: requiresDeposit ? new Date(Date.now() + HOLD_MINUTES * 60_000) : null,
          ...(requiresDeposit
            ? { deposit: { create: { amountNaira: depositAmountNaira, status: "PENDING" } } }
            : {}),
        },
      });
      return { appointmentId: appointment.id, requiresDeposit, depositAmountNaira };
    } catch (error) {
      if (isSlotConflictError(error)) {
        return "slot-taken" as const;
      }
      throw error;
    }
  });

  if (result === "salon-not-found") return NextResponse.json({ ok: false, error: "Salon not found" }, { status: 404 });
  if (result === "service-not-found") return NextResponse.json({ ok: false, error: "Service not found" }, { status: 404 });
  if (result === "staff-not-found") return NextResponse.json({ ok: false, error: "Staff member not found" }, { status: 404 });
  if (result === "staff-inactive") {
    return NextResponse.json({ ok: false, error: "This staff member is no longer taking bookings." }, { status: 409 });
  }
  if (result === "slot-taken") return NextResponse.json({ ok: false, error: SLOT_TAKEN }, { status: 409 });

  // Deposit bookings are confirmed (and announced) once the deposit is paid —
  // see /api/public/book/deposit/verify.
  if (!result.requiresDeposit) await sendBookingConfirmed(salonId, result.appointmentId);

  return NextResponse.json({
    ok: true,
    appointmentId: result.appointmentId,
    requiresDeposit: result.requiresDeposit,
    depositAmountNaira: result.requiresDeposit ? result.depositAmountNaira : undefined,
  });
}

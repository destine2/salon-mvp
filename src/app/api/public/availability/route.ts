import { NextRequest, NextResponse } from "next/server";
import { availableSlots } from "@/lib/day-availability";
import { ACTIVE_STATUSES } from "@/lib/overlap";
import { instantToLagosDate, lagosToInstant, parseDateOnly } from "@/lib/lagos-time";
import { withTenant } from "@/lib/tenant";

// Public — computes open slots for a given staff/service/day so the
// customer-facing booking page only ever shows times that are actually free.
//
// Two things this route used to get wrong, both worth not reintroducing:
//
//  * It asked the database whether each candidate slot was free, one query per
//    slot — roughly twenty round trips to render one page, on an unauthenticated
//    endpoint, for customers on 2G. It now reads the day's appointments once.
//
//  * It built slot times with `setHours()`, i.e. the server's local timezone.
//    Correct on a Lagos laptop, an hour out on Vercel's UTC servers. Slot times
//    are now resolved explicitly through lib/lagos-time.
export async function GET(req: NextRequest) {
  const salonId = req.nextUrl.searchParams.get("salonId");
  const staffId = req.nextUrl.searchParams.get("staffId");
  const serviceId = req.nextUrl.searchParams.get("serviceId");
  const dateParam = req.nextUrl.searchParams.get("date");

  if (!salonId || !staffId || !serviceId || !dateParam) {
    return NextResponse.json(
      { ok: false, error: "salonId, staffId, serviceId, and date are required" },
      { status: 400 }
    );
  }

  // Accept a plain YYYY-MM-DD; anything else is a client bug worth surfacing
  // rather than silently coercing into the wrong day.
  let date: string;
  try {
    const { year, month, day } = parseDateOnly(dateParam.slice(0, 10));
    date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  } catch {
    return NextResponse.json(
      { ok: false, error: "date must be in YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  const result = await withTenant(salonId, async (tx) => {
    const service = await tx.service.findUnique({ where: { id: serviceId } });
    if (!service || service.salonId !== salonId) {
      return "service-not-found" as const;
    }

    // The booking page only ever offers active staff, so this only fires
    // against a stale page or a direct API call — but it's the actual
    // enforcement point, same as the check in /api/public/book.
    const staff = await tx.staff.findUnique({ where: { id: staffId } });
    if (!staff || staff.salonId !== service.salonId) {
      return "staff-not-found" as const;
    }
    if (!staff.active) {
      return "staff-inactive" as const;
    }

    // The Lagos day maps to a UTC window that starts the previous evening, so
    // bound the query by real instants rather than by calendar date.
    const dayStart = lagosToInstant(date, 0);
    const dayEnd = lagosToInstant(date, 24 * 60);

    const [hours, appointments] = await Promise.all([
      tx.businessHours.findMany({ where: { salonId: service.salonId } }),
      tx.appointment.findMany({
        where: {
          staffId,
          status: { in: [...ACTIVE_STATUSES] },
          startTime: { gte: dayStart, lt: dayEnd },
        },
        select: { startTime: true, endTime: true },
      }),
    ]);

    return { service, hours, appointments };
  });

  if (result === "service-not-found") return NextResponse.json({ ok: false, error: "Service not found" }, { status: 404 });
  if (result === "staff-not-found") return NextResponse.json({ ok: false, error: "Staff member not found" }, { status: 404 });
  if (result === "staff-inactive") {
    return NextResponse.json({ ok: false, error: "This staff member is no longer taking bookings." }, { status: 409 });
  }

  const { service, hours, appointments } = result;

  const slots = availableSlots({
    date,
    hours: hours.map((h) => ({
      weekday: h.weekday,
      opensMin: h.opensMin,
      closesMin: h.closesMin,
    })),
    durationMin: service.durationMin,
    busy: appointments.map((a) => ({ start: a.startTime, end: a.endTime })),
    now: new Date(),
  });

  return NextResponse.json({
    ok: true,
    date,
    slots: slots.map((s) => s.toISOString()),
    // Helps the booking page distinguish "closed today" from "fully booked",
    // which are very different messages to show a customer.
    closed: slots.length === 0 && appointments.length === 0,
    today: instantToLagosDate(new Date()),
  });
}

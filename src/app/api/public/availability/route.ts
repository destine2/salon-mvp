import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { availableSlots } from "@/lib/day-availability";
import { ACTIVE_STATUSES } from "@/lib/overlap";
import { instantToLagosDate, lagosToInstant, parseDateOnly } from "@/lib/lagos-time";

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
  const staffId = req.nextUrl.searchParams.get("staffId");
  const serviceId = req.nextUrl.searchParams.get("serviceId");
  const dateParam = req.nextUrl.searchParams.get("date");

  if (!staffId || !serviceId || !dateParam) {
    return NextResponse.json(
      { ok: false, error: "staffId, serviceId, and date are required" },
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

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) {
    return NextResponse.json({ ok: false, error: "Service not found" }, { status: 404 });
  }

  // The Lagos day maps to a UTC window that starts the previous evening, so
  // bound the query by real instants rather than by calendar date.
  const dayStart = lagosToInstant(date, 0);
  const dayEnd = lagosToInstant(date, 24 * 60);

  const [hours, appointments] = await Promise.all([
    prisma.businessHours.findMany({ where: { salonId: service.salonId } }),
    prisma.appointment.findMany({
      where: {
        staffId,
        status: { in: [...ACTIVE_STATUSES] },
        startTime: { gte: dayStart, lt: dayEnd },
      },
      select: { startTime: true, endTime: true },
    }),
  ]);

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

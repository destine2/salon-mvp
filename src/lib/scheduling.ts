import { prisma } from "@/lib/prisma";

const ACTIVE_STATUSES = ["BOOKED", "CONFIRMED", "COMPLETED"] as const;

// Fixed default hours for MVP — every salon is assumed open 9am-7pm local
// time. Making this per-salon/configurable is a reasonable Phase 2+ add-on
// once real pilot salons tell us their actual hours vary.
export const BUSINESS_HOURS = { startHour: 9, endHour: 19 };
const SLOT_STEP_MIN = 30;

/** Every slot start time for a given day, regardless of availability. */
export function generateDaySlotStarts(date: Date): Date[] {
  const slots: Date[] = [];
  const day = new Date(date);
  day.setHours(BUSINESS_HOURS.startHour, 0, 0, 0);
  const end = new Date(date);
  end.setHours(BUSINESS_HOURS.endHour, 0, 0, 0);

  for (let t = new Date(day); t < end; t = new Date(t.getTime() + SLOT_STEP_MIN * 60_000)) {
    slots.push(new Date(t));
  }
  return slots;
}

/**
 * True if staffId has no existing (non-cancelled/no-show) appointment that
 * overlaps [startTime, startTime + durationMin). This is the server-side
 * guard against double-booking — the thing that makes "two staff editing
 * the same slot while offline" resolve to "whoever's write reaches the
 * server first wins" (PRD risk mitigation): the second write just fails
 * this check with a normal error the client can show.
 */
export async function isSlotAvailable(params: {
  staffId: string;
  startTime: Date;
  durationMin: number;
  excludeAppointmentId?: string;
}): Promise<boolean> {
  const dayStart = new Date(params.startTime);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const candidates = await prisma.appointment.findMany({
    where: {
      staffId: params.staffId,
      startTime: { gte: dayStart, lt: dayEnd },
      status: { in: [...ACTIVE_STATUSES] },
      ...(params.excludeAppointmentId ? { id: { not: params.excludeAppointmentId } } : {}),
    },
    include: { service: true },
  });

  const newStart = params.startTime.getTime();
  const newEnd = newStart + params.durationMin * 60_000;

  return !candidates.some((appt) => {
    const existingStart = appt.startTime.getTime();
    const existingEnd = existingStart + appt.service.durationMin * 60_000;
    return newStart < existingEnd && existingStart < newEnd;
  });
}

import { prisma } from "@/lib/prisma";
import { ACTIVE_STATUSES, appointmentEndTime, conflictsWithAny } from "@/lib/overlap";

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
 * overlaps [startTime, startTime + durationMin).
 *
 * This is a PRE-CHECK, not the guarantee. It reads and then the caller writes,
 * so two concurrent requests can both pass it — the actual protection is the
 * exclusion constraint in prisma/sql/001_appointment_no_overlap.sql, which
 * makes the losing write fail. Keep this check anyway: it produces a helpful
 * 409 in the ordinary case instead of surfacing a database error.
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

  const candidate = {
    start: params.startTime,
    end: appointmentEndTime(params.startTime, params.durationMin),
  };

  return !conflictsWithAny(
    candidate,
    candidates.map((appt) => ({
      start: appt.startTime,
      end: appointmentEndTime(appt.startTime, appt.service.durationMin),
    }))
  );
}

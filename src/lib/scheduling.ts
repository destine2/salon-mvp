import { prisma } from "@/lib/prisma";
import { ACTIVE_STATUSES, appointmentEndTime, conflictsWithAny } from "@/lib/overlap";

// Slot generation lives in src/lib/day-availability.ts now. The version that
// used to sit here hardcoded 9am-7pm for every salon and built times with
// setHours(), i.e. the *server's* timezone — correct on a Lagos laptop, an
// hour out on Vercel's UTC servers. Both are deliberately gone rather than
// deprecated, so neither can be picked up again by accident.

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

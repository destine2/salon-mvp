/**
 * Pure interval logic for appointments — no Prisma, no clock, no network.
 *
 * Split out of scheduling.ts so the overlap rules can be tested without a
 * database. The semantics here must stay identical to the SQL exclusion
 * constraint in prisma/sql/001_appointment_no_overlap.sql: if they drift, the
 * pre-check and the guarantee disagree and users get raw database errors
 * instead of the friendly conflict message.
 */

/** Statuses that occupy a stylist's time. Mirrors the SQL constraint's WHERE. */
export const ACTIVE_STATUSES = ["HELD", "BOOKED", "CONFIRMED", "COMPLETED"] as const;

export type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

export interface Interval {
  start: Date;
  end: Date;
}

/**
 * End of an appointment, derived from its service duration.
 * Single source of truth for the denormalized Appointment.endTime column.
 */
export function appointmentEndTime(startTime: Date, durationMin: number): Date {
  return new Date(startTime.getTime() + durationMin * 60_000);
}

/**
 * Half-open overlap: [aStart, aEnd) vs [bStart, bEnd).
 *
 * Touching endpoints do NOT overlap — a 10:00-11:00 booking leaves 11:00 free.
 * This matches the '[)' range bound in the SQL constraint.
 */
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/**
 * True when the candidate interval collides with any existing one.
 */
export function conflictsWithAny(candidate: Interval, existing: Interval[]): boolean {
  return existing.some((slot) => intervalsOverlap(candidate, slot));
}

/**
 * Postgres raises SQLSTATE 23P01 (exclusion_violation) when the constraint
 * rejects a write. Prisma surfaces it as a raw error rather than a typed one,
 * so the code is matched on the message.
 *
 * This is what turns the losing side of a booking race into the "that slot was
 * just taken" 409 the customer should see, instead of a 500.
 */
export function isSlotConflictError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string; meta?: { code?: string } };
  if (candidate.code === "23P01" || candidate.meta?.code === "23P01") return true;
  const message = String(candidate.message ?? "");
  return message.includes("23P01") || message.includes("appointment_no_overlap");
}

/**
 * Fixed-offset time helpers for Africa/Lagos.
 *
 * WHY THIS EXISTS
 *
 * Slot generation used `date.setHours(9, 0, 0, 0)`, which is the *server's*
 * local time. On a Lagos laptop that is correct by accident; on Vercel, which
 * runs UTC, every generated slot shifts by an hour — a salon opening at 09:00
 * would be offered from 10:00. The bug is invisible in development and wrong
 * in production, which is the worst combination.
 *
 * Lagos is UTC+1 all year with no daylight saving, so a fixed offset is exact
 * rather than an approximation, and avoids pulling in a timezone database.
 * Every assumption about that lives in this one file: supporting a DST market
 * later means replacing this module, not hunting through the slot maths.
 */

export const MINUTE_MS = 60_000;
export const LAGOS_OFFSET_MINUTES = 60;

/** "HH:MM" -> minutes past midnight. */
export function parseClock(clock: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!match) throw new Error(`Invalid time "${clock}" — expected HH:MM`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`Invalid time "${clock}"`);
  return hours * 60 + minutes;
}

/** Minutes past midnight -> "HH:MM", for display and form values. */
export function formatClock(minutesPastMidnight: number): string {
  const h = Math.floor(minutesPastMidnight / 60);
  const m = minutesPastMidnight % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" -> {year, month, day}. Rejects anything else. */
export function parseDateOnly(date: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!match) throw new Error(`Invalid date "${date}" — expected YYYY-MM-DD`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/**
 * A Lagos wall-clock date and time as a real instant.
 * `2026-09-02` at 09:00 Lagos is 08:00 UTC.
 */
export function lagosToInstant(date: string, minutesPastMidnight: number): Date {
  const { year, month, day } = parseDateOnly(date);
  const utcMidnight = Date.UTC(year, month - 1, day);
  return new Date(utcMidnight + (minutesPastMidnight - LAGOS_OFFSET_MINUTES) * MINUTE_MS);
}

/**
 * Weekday of a Lagos calendar date: 0 = Sunday … 6 = Saturday.
 *
 * Derived from the date parts rather than from an instant, so "which day is
 * 2026-09-05" never depends on where the server happens to be running.
 */
export function lagosWeekday(date: string): number {
  const { year, month, day } = parseDateOnly(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** An instant rendered as Lagos wall-clock "HH:MM". */
export function instantToLagosClock(instant: Date): string {
  const shifted = new Date(instant.getTime() + LAGOS_OFFSET_MINUTES * MINUTE_MS);
  return `${String(shifted.getUTCHours()).padStart(2, "0")}:${String(
    shifted.getUTCMinutes()
  ).padStart(2, "0")}`;
}

/** The Lagos calendar date ("YYYY-MM-DD") an instant falls on. */
export function instantToLagosDate(instant: Date): string {
  const shifted = new Date(instant.getTime() + LAGOS_OFFSET_MINUTES * MINUTE_MS);
  return shifted.toISOString().slice(0, 10);
}

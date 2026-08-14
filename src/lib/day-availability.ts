/**
 * Slot computation for one salon, one service, one day — pure.
 *
 * Replaces two problems in the original implementation:
 *
 *  1. Business hours were hardcoded to 09:00–19:00 for every salon on earth.
 *     They are now supplied by the caller from the salon's own configuration.
 *
 *  2. Availability was computed by asking the database once per candidate slot
 *     (~20 queries for a single page load, on a public endpoint, over 2G). The
 *     caller now fetches the day's appointments once and this function does the
 *     rest in memory.
 *
 * No database, no clock, no timezone guessing — `now` is injected, and wall
 * clock is resolved through lib/lagos-time.
 */

import { intervalsOverlap } from "./overlap";
import { lagosToInstant, lagosWeekday, MINUTE_MS } from "./lagos-time";

/** Opening hours for a single weekday, as minutes past midnight, Lagos time. */
export interface DayHours {
  weekday: number;
  opensMin: number;
  closesMin: number;
}

export interface BusyInterval {
  start: Date;
  end: Date;
}

export interface SlotInput {
  /** Lagos calendar date, "YYYY-MM-DD". */
  date: string;
  /** All configured hours for the salon; the matching weekday is selected here. */
  hours: DayHours[];
  durationMin: number;
  /** Existing appointments for this staff member (live statuses only). */
  busy: BusyInterval[];
  /** Spacing between offered start times. */
  stepMin?: number;
  /** Injected clock — slots already past are never offered. */
  now: Date;
  /** Lead time before the earliest bookable slot. */
  minNoticeMin?: number;
}

/**
 * Fallback used only when a salon has configured no hours at all.
 *
 * A salon with *some* hours configured is closed on the days it did not
 * configure — that is a deliberate choice. But a salon with *none* has simply
 * not been set up yet, and defaulting it to "closed forever" would silently
 * break booking for every existing salon the moment this shipped.
 */
export const DEFAULT_HOURS = { opensMin: 9 * 60, closesMin: 19 * 60 };

export function hoursForDate(date: string, hours: DayHours[]): DayHours | null {
  const weekday = lagosWeekday(date);

  if (hours.length === 0) {
    return { weekday, ...DEFAULT_HOURS };
  }

  return hours.find((h) => h.weekday === weekday) ?? null;
}

/**
 * Candidate start times across the open window, ignoring bookings.
 * A slot must finish by closing time, so the last start is close − duration.
 */
export function slotStartsForDay(input: {
  date: string;
  hours: DayHours[];
  durationMin: number;
  stepMin?: number;
}): Date[] {
  const day = hoursForDate(input.date, input.hours);
  if (!day) return []; // closed

  const step = input.stepMin ?? 30;
  const starts: Date[] = [];

  for (
    let minute = day.opensMin;
    minute + input.durationMin <= day.closesMin;
    minute += step
  ) {
    starts.push(lagosToInstant(input.date, minute));
  }

  return starts;
}

/**
 * Bookable start times: open, long enough, not already taken, not in the past.
 */
export function availableSlots(input: SlotInput): Date[] {
  const candidates = slotStartsForDay({
    date: input.date,
    hours: input.hours,
    durationMin: input.durationMin,
    stepMin: input.stepMin,
  });

  const earliest = input.now.getTime() + (input.minNoticeMin ?? 0) * MINUTE_MS;

  return candidates.filter((start) => {
    if (start.getTime() < earliest) return false;

    const candidate = {
      start,
      end: new Date(start.getTime() + input.durationMin * MINUTE_MS),
    };
    return !input.busy.some((taken) => intervalsOverlap(candidate, taken));
  });
}

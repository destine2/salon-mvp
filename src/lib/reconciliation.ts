/**
 * Daily reconciliation logic — pure, no Prisma, no clock.
 *
 * PRD 5.2 makes payment integrity the product's core differentiator, and the
 * checkout flow already closes the obvious hole: COMPLETED can only be reached
 * through checkout, so a service cannot be marked done without a logged payment.
 *
 * That leaves the quieter hole this module covers. A staff member diverting
 * cash does not need to defeat checkout — they simply never open it. The
 * customer is served, the money is pocketed, and the appointment sits at
 * BOOKED until it quietly ages into the past. It is not COMPLETED, so it never
 * reaches the collected totals; it is not NO_SHOW, so it never reaches that
 * count; it has no Transaction, so it can never be flagged. It is invisible.
 *
 * Every appointment whose time has passed must therefore end in one of two
 * places: money collected, or explicitly marked no-show/cancelled. Anything
 * still open is unaccounted for, and the owner is asked to resolve it.
 */

export type ReconcilableStatus =
  | "BOOKED"
  | "CONFIRMED"
  | "COMPLETED"
  | "NO_SHOW"
  | "CANCELLED";

/** Statuses that mean "this appointment is still expected to happen". */
const OPEN_STATUSES: ReconcilableStatus[] = ["BOOKED", "CONFIRMED"];

export interface ReconcilableAppointment {
  id: string;
  endTime: Date;
  status: ReconcilableStatus;
  servicePriceNaira: number;
  hasTransaction: boolean;
}

/**
 * An appointment is unaccounted when its end time has passed and nobody has
 * closed it out — neither taking payment nor recording that the customer
 * didn't come.
 *
 * Deliberately keyed on endTime rather than startTime: an appointment still
 * in progress is not yet late, and flagging it would train owners to ignore
 * the list.
 */
export function isUnaccounted(appointment: ReconcilableAppointment, now: Date): boolean {
  return (
    OPEN_STATUSES.includes(appointment.status) &&
    appointment.endTime.getTime() < now.getTime()
  );
}

export interface UnaccountedSummary<T> {
  items: T[];
  count: number;
  /** Revenue that should have been collected but has no record either way. */
  valueAtRiskNaira: number;
}

/**
 * Partition the day's appointments into the ones needing the owner's attention.
 */
export function findUnaccounted<T extends ReconcilableAppointment>(
  appointments: T[],
  now: Date
): UnaccountedSummary<T> {
  const items = appointments.filter((a) => isUnaccounted(a, now));
  return {
    items,
    count: items.length,
    valueAtRiskNaira: items.reduce((sum, a) => sum + a.servicePriceNaira, 0),
  };
}

/**
 * A completed appointment with no Transaction row should be impossible —
 * checkout creates both in one transaction. If one ever appears it means the
 * integrity guarantee has been bypassed (a manual database edit, a partial
 * write, or a regression in the checkout path), so it is reported separately
 * rather than folded into the ordinary flagged list where it would look like
 * a routine under-payment.
 */
export function findIntegrityAnomalies<T extends ReconcilableAppointment>(
  appointments: T[]
): T[] {
  return appointments.filter((a) => a.status === "COMPLETED" && !a.hasTransaction);
}

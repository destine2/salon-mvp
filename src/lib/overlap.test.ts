/**
 * Overlap rules — run with `npm test`.
 *
 * These assertions define the contract the SQL exclusion constraint in
 * prisma/sql/001_appointment_no_overlap.sql also implements. If you change the
 * range bounds in one place, this suite should fail until you change the other.
 */

import test from "node:test";
import assert from "node:assert";

import {
  appointmentEndTime,
  conflictsWithAny,
  intervalsOverlap,
  isSlotConflictError,
} from "./overlap";

/** Wall-clock helper: minutes past 2026-09-02T09:00 local. */
function at(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2026, 8, 2, h, m, 0, 0);
}

function span(startClock: string, endClock: string) {
  return { start: at(startClock), end: at(endClock) };
}

test("appointmentEndTime adds the service duration", () => {
  assert.strictEqual(appointmentEndTime(at("10:00"), 90).getTime(), at("11:30").getTime());
});

test("identical intervals overlap", () => {
  assert.ok(intervalsOverlap(span("10:00", "11:00"), span("10:00", "11:00")));
});

test("partial overlap at either edge is detected", () => {
  assert.ok(intervalsOverlap(span("10:00", "11:00"), span("10:30", "11:30")));
  assert.ok(intervalsOverlap(span("10:30", "11:30"), span("10:00", "11:00")));
});

test("an interval fully containing another overlaps", () => {
  assert.ok(intervalsOverlap(span("09:00", "13:00"), span("10:00", "11:00")));
  assert.ok(intervalsOverlap(span("10:00", "11:00"), span("09:00", "13:00")));
});

test("touching endpoints do NOT overlap", () => {
  // A 10:00-11:00 booking must leave 11:00 bookable. This mirrors the '[)'
  // bound in the SQL constraint — if that changed to '[]', this would fail.
  assert.strictEqual(intervalsOverlap(span("10:00", "11:00"), span("11:00", "12:00")), false);
  assert.strictEqual(intervalsOverlap(span("11:00", "12:00"), span("10:00", "11:00")), false);
});

test("disjoint intervals do not overlap", () => {
  assert.strictEqual(intervalsOverlap(span("10:00", "11:00"), span("14:00", "15:00")), false);
});

test("zero-length interval never blocks a slot", () => {
  assert.strictEqual(intervalsOverlap(span("10:00", "10:00"), span("10:00", "11:00")), false);
});

test("conflictsWithAny finds a collision anywhere in the list", () => {
  const existing = [span("09:00", "09:30"), span("12:00", "13:00"), span("15:00", "16:00")];
  assert.ok(conflictsWithAny(span("12:30", "13:30"), existing));
  assert.strictEqual(conflictsWithAny(span("13:00", "14:00"), existing), false);
  assert.strictEqual(conflictsWithAny(span("10:00", "11:00"), []), false);
});

test("a longer service collides with a booking it would swallow", () => {
  // 3h service starting 10:00 vs an existing 12:00 appointment.
  const candidate = { start: at("10:00"), end: appointmentEndTime(at("10:00"), 180) };
  assert.ok(conflictsWithAny(candidate, [span("12:00", "12:30")]));
});

test("recognises a Postgres exclusion violation however Prisma surfaces it", () => {
  assert.ok(isSlotConflictError({ code: "23P01" }));
  assert.ok(isSlotConflictError({ meta: { code: "23P01" } }));
  assert.ok(
    isSlotConflictError(
      new Error('conflicting key value violates exclusion constraint "appointment_no_overlap"')
    )
  );
});

test("unrelated errors are not mistaken for slot conflicts", () => {
  assert.strictEqual(isSlotConflictError(new Error("connection refused")), false);
  assert.strictEqual(isSlotConflictError({ code: "P2002" }), false);
  assert.strictEqual(isSlotConflictError(null), false);
  assert.strictEqual(isSlotConflictError(undefined), false);
});

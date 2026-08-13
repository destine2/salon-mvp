import test from "node:test";
import assert from "node:assert";

import {
  findIntegrityAnomalies,
  findUnaccounted,
  isUnaccounted,
  type ReconcilableAppointment,
  type ReconcilableStatus,
} from "./reconciliation";

const NOW = new Date(2026, 8, 2, 15, 0, 0); // 15:00

function appt(
  overrides: Partial<ReconcilableAppointment> & { status: ReconcilableStatus }
): ReconcilableAppointment {
  return {
    id: overrides.id ?? "a1",
    endTime: overrides.endTime ?? new Date(2026, 8, 2, 12, 0, 0), // 12:00, in the past
    status: overrides.status,
    servicePriceNaira: overrides.servicePriceNaira ?? 10_000,
    hasTransaction: overrides.hasTransaction ?? false,
  };
}

test("a past appointment left BOOKED is unaccounted", () => {
  assert.ok(isUnaccounted(appt({ status: "BOOKED" }), NOW));
});

test("a past appointment left CONFIRMED is unaccounted", () => {
  // Confirmed but never checked out is the same problem: the customer was
  // seen, and no money was recorded.
  assert.ok(isUnaccounted(appt({ status: "CONFIRMED" }), NOW));
});

test("closed-out appointments are never unaccounted", () => {
  for (const status of ["COMPLETED", "NO_SHOW", "CANCELLED"] as ReconcilableStatus[]) {
    assert.strictEqual(
      isUnaccounted(appt({ status }), NOW),
      false,
      `${status} should not be unaccounted`
    );
  }
});

test("an appointment still in progress is not yet unaccounted", () => {
  // Ends at 15:30, now is 15:00 — flagging this would train owners to ignore
  // the list.
  const inProgress = appt({ status: "BOOKED", endTime: new Date(2026, 8, 2, 15, 30, 0) });
  assert.strictEqual(isUnaccounted(inProgress, NOW), false);
});

test("an appointment ending exactly now is not yet late", () => {
  const endingNow = appt({ status: "BOOKED", endTime: NOW });
  assert.strictEqual(isUnaccounted(endingNow, NOW), false);
});

test("a future appointment is not unaccounted", () => {
  const later = appt({ status: "BOOKED", endTime: new Date(2026, 8, 2, 18, 0, 0) });
  assert.strictEqual(isUnaccounted(later, NOW), false);
});

test("findUnaccounted totals the revenue with no record either way", () => {
  const result = findUnaccounted(
    [
      appt({ id: "past-booked", status: "BOOKED", servicePriceNaira: 8_500 }),
      appt({ id: "past-confirmed", status: "CONFIRMED", servicePriceNaira: 15_000 }),
      appt({ id: "paid", status: "COMPLETED", hasTransaction: true, servicePriceNaira: 20_000 }),
      appt({ id: "no-show", status: "NO_SHOW", servicePriceNaira: 12_000 }),
      appt({
        id: "later-today",
        status: "BOOKED",
        endTime: new Date(2026, 8, 2, 18, 0, 0),
        servicePriceNaira: 30_000,
      }),
    ],
    NOW
  );

  assert.strictEqual(result.count, 2);
  assert.deepStrictEqual(
    result.items.map((a) => a.id),
    ["past-booked", "past-confirmed"]
  );
  assert.strictEqual(result.valueAtRiskNaira, 23_500);
});

test("a clean day reports nothing at risk", () => {
  const result = findUnaccounted(
    [
      appt({ status: "COMPLETED", hasTransaction: true }),
      appt({ status: "NO_SHOW" }),
      appt({ status: "CANCELLED" }),
    ],
    NOW
  );
  assert.strictEqual(result.count, 0);
  assert.strictEqual(result.valueAtRiskNaira, 0);
});

test("a COMPLETED appointment with no transaction is an integrity anomaly", () => {
  // Should be impossible — checkout writes both in one transaction. If it
  // appears, the guarantee was bypassed and it deserves its own bucket.
  const anomalies = findIntegrityAnomalies([
    appt({ id: "bypassed", status: "COMPLETED", hasTransaction: false }),
    appt({ id: "normal", status: "COMPLETED", hasTransaction: true }),
    appt({ id: "open", status: "BOOKED", hasTransaction: false }),
  ]);
  assert.deepStrictEqual(
    anomalies.map((a) => a.id),
    ["bypassed"]
  );
});

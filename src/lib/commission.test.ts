import test from "node:test";
import assert from "node:assert";

import type { CommissionRule } from "@prisma/client";
import { calculateSplit } from "./commission";

// calculateSplit only reads `type`/`value` and immediately does Number(value),
// so a plain-number literal is a faithful runtime stand-in for the Decimal
// Prisma actually returns — the cast is on the object, not the field, since
// Decimal has no numeric literal form to assign one for one.
function rule(type: CommissionRule["type"], value: number): Pick<CommissionRule, "type" | "value"> {
  return { type, value } as unknown as Pick<CommissionRule, "type" | "value">;
}

test("PERCENT splits proportionally", () => {
  const split = calculateSplit(rule("PERCENT", 40), 10000);
  assert.strictEqual(split.staffShare, 4000);
  assert.strictEqual(split.ownerShare, 6000);
});

test("PERCENT: staff and owner shares always sum to the total", () => {
  const split = calculateSplit(rule("PERCENT", 33), 9999);
  assert.strictEqual(
    Math.round((split.staffShare + split.ownerShare) * 100),
    Math.round(9999 * 100)
  );
});

test("FLAT: staff gets a fixed naira amount regardless of service price", () => {
  // This is the case a single subaccount percentage_charge cannot represent:
  // a fixed ₦5,000 is a different percentage on every different service
  // price. Locking in the exact behavior initialize/route.ts now depends on.
  const onCheapService = calculateSplit(rule("FLAT", 5000), 6000);
  const onExpensiveService = calculateSplit(rule("FLAT", 5000), 18000);

  assert.strictEqual(onCheapService.staffShare, 5000);
  assert.strictEqual(onCheapService.ownerShare, 1000);
  assert.strictEqual(onExpensiveService.staffShare, 5000);
  assert.strictEqual(onExpensiveService.ownerShare, 13000);

  // Same flat value, wildly different implied percentage — 83% vs 28% —
  // which is exactly why a single static Paystack subaccount percentage can
  // never be correct for a FLAT rule across more than one price point.
  const cheapPercent = onCheapService.staffShare / 6000;
  const expensivePercent = onExpensiveService.staffShare / 18000;
  assert.ok(Math.abs(cheapPercent - expensivePercent) > 0.5);
});

test("FLAT: a flat amount larger than the service price cannot pay out more than the service price", () => {
  const split = calculateSplit(rule("FLAT", 50000), 6000);
  assert.strictEqual(split.staffShare, 6000);
  assert.strictEqual(split.ownerShare, 0);
});

test("CHAIR_RENTAL: owner takes the fixed rent, staff keeps the remainder", () => {
  // Inverse of FLAT — the owner's share is the fixed amount here, not the
  // staff's. Getting these two switched would silently pay the wrong party.
  const split = calculateSplit(rule("CHAIR_RENTAL", 2000), 12000);
  assert.strictEqual(split.ownerShare, 2000);
  assert.strictEqual(split.staffShare, 10000);
});

test("CHAIR_RENTAL: rent larger than the service price cannot go negative", () => {
  const split = calculateSplit(rule("CHAIR_RENTAL", 50000), 6000);
  assert.strictEqual(split.ownerShare, 6000);
  assert.strictEqual(split.staffShare, 0);
});

test("rounds to 2 decimal places rather than leaking float artifacts", () => {
  const split = calculateSplit(rule("PERCENT", 33.333), 100);
  assert.strictEqual(split.staffShare, Math.round(split.staffShare * 100) / 100);
  assert.strictEqual(split.ownerShare, Math.round(split.ownerShare * 100) / 100);
});

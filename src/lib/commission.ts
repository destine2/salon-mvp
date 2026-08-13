import type { CommissionRule } from "@prisma/client";

export type Split = { ownerShare: number; staffShare: number };

/**
 * The one calculation every payment path (cash, transfer, Paystack) shares.
 * Paystack's Transaction Splits API does this same math internally for
 * digital payments (see src/lib/paystack.ts) — this function exists so cash
 * and transfer payments, which Paystack never sees, produce an identical
 * TransactionSplit shape for reporting (PRD section 9 — TransactionSplit).
 */
export function calculateSplit(rule: Pick<CommissionRule, "type" | "value">, amountNaira: number): Split {
  const value = Number(rule.value);

  switch (rule.type) {
    case "PERCENT": {
      const staffShare = round2((amountNaira * value) / 100);
      return { ownerShare: round2(amountNaira - staffShare), staffShare };
    }
    case "FLAT": {
      const staffShare = round2(Math.min(value, amountNaira));
      return { ownerShare: round2(amountNaira - staffShare), staffShare };
    }
    case "CHAIR_RENTAL": {
      // Chair rental is a fixed cost the staff member owes the owner per
      // service, not a cut of this specific payment — so the owner's
      // "share" of THIS transaction is the rental fee, staff keeps the rest.
      const ownerShare = round2(Math.min(value, amountNaira));
      return { ownerShare, staffShare: round2(amountNaira - ownerShare) };
    }
    default:
      return { ownerShare: amountNaira, staffShare: 0 };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

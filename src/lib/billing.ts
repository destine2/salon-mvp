import type { Salon } from "@prisma/client";

/** ₦15,000/month — the one real paid tier. See PAYSTACK_PLAN_CODE and the
 * plan doc's "Next: subscription billing" section for why only one tier
 * exists right now. */
export const SUBSCRIPTION_PRICE_NAIRA = 15_000;

export const TRIAL_DAYS = 14;

/**
 * The single source of truth for whether a salon currently has full
 * access. Computed at request time, not eagerly flipped by a job — a
 * trial "downgrades" itself the moment it's checked past its end date.
 * tier only ever becomes PAID via a real, webhook-confirmed charge (see
 * src/app/api/webhooks/paystack/route.ts), and only ever reverts to FREE
 * the same way (subscription.disable) — never inferred from the trial.
 */
export function isEntitled(salon: Pick<Salon, "tier" | "trialEndsAt">): boolean {
  if (salon.tier === "PAID") return true;
  return salon.trialEndsAt != null && salon.trialEndsAt.getTime() > Date.now();
}

/** How many whole days remain in an active trial — never negative. */
export function trialDaysRemaining(trialEndsAt: Date | null): number {
  if (!trialEndsAt) return 0;
  const ms = trialEndsAt.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60_000)));
}

/** FREE tier's staff cap — the owner plus one other staff member. */
export const FREE_TIER_STAFF_LIMIT = 2;

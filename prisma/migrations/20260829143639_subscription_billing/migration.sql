-- Hand-written rather than `prisma migrate dev` — see the header of
-- 20260816095500_appointment_times_timestamptz/migration.sql for why
-- (no shadow-database access against the Supabase pooler). Applied via
-- `migrate deploy`.
--
-- Adds subscription billing: a 14-day trial on signup, one real paid tier
-- (PAID, ₦15,000/month via Paystack Subscriptions), downgrade to FREE on
-- lapse. See the plan doc's "Next: subscription billing" section for the
-- full design. Same ALTER TYPE ... ADD VALUE safety note as the
-- deposit-hold migration: nothing in this file uses 'PAID' as data in the
-- same transaction it's added in.
ALTER TYPE "SalonTier" ADD VALUE 'PAID';

ALTER TABLE "Salon" ADD COLUMN "trialEndsAt" TIMESTAMPTZ(3);
ALTER TABLE "Salon" ADD COLUMN "paystackSubscriptionCode" TEXT;
ALTER TABLE "Salon" ADD COLUMN "paystackCustomerCode" TEXT;
ALTER TABLE "Salon" ADD COLUMN "subscriptionRenewsAt" TIMESTAMPTZ(3);
ALTER TABLE "Salon" ADD COLUMN "lastSubscriptionPaymentRef" TEXT;

-- Real, database-enforced tenant isolation.
--
-- WHY THIS ISN'T JUST "TURN ON RLS"
--
-- The app has always connected to Postgres as the `postgres` role, which
-- owns every table and has BYPASSRLS. Both of those unconditionally bypass
-- row-level security regardless of any policy — confirmed live before
-- writing this file:
--   SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
--   -> postgres | false | true
-- Enabling RLS with no other change would be pure theater: every query would
-- keep seeing every salon's data exactly as today, silently. Real
-- enforcement needs a second, restricted role that the *running app*
-- connects as instead — this migration only creates the DB-side half of
-- that (role, grants, policies, escape-hatch functions). It changes nothing
-- about what the live app can currently see: `postgres` keeps bypassing
-- everything until DATABASE_URL itself is switched to app_runtime, which is
-- a deliberate, separate step (see the plan file), not part of this
-- migration.
--
-- There's also no Supabase Auth session to key policies off (auth.uid()) --
-- this app has its own phone+password auth — so policies check a session
-- variable (app.current_salon_id) that the app sets per-request via
-- src/lib/tenant.ts#withTenant, not the usual Supabase-native pattern.
--
-- APPLY WITH: psql "$MIGRATION_DATABASE_URL" -f prisma/migrations/20260921063143_row_level_security/migration.sql
-- (the postgres-role connection — this file creates/alters roles and
-- policies, privileged operations the restricted role could never run
-- against itself even after it exists.)
--
-- SEPARATE, OUT-OF-BAND STEP NOT IN THIS FILE: `ALTER ROLE app_runtime WITH
-- PASSWORD '...'` — deliberately not committed. Run it directly, once, and
-- put the resulting connection string straight into .env / Vercel's
-- DATABASE_URL, same handling as every other secret this session.

-- ---------------------------------------------------------------------------
-- 1. The restricted role
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE postgres TO app_runtime;
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
-- So a future migration's new table is automatically usable by the app
-- without a repeat of this grant — new tables stay owned by `postgres`
-- (whoever runs migrations), this just extends the same access forward.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;

-- ---------------------------------------------------------------------------
-- 2. RLS policies
--
-- current_setting(..., true) — missing_ok — rather than erroring when unset.
-- This is what makes the failure mode safe: a route that forgets to open a
-- tenant context (src/lib/tenant.ts#withTenant) gets zero rows back
-- ("salonId" = NULL is never true in SQL), a loud, obvious break caught in
-- testing — not a cross-tenant leak.
-- ---------------------------------------------------------------------------

-- Salon itself, keyed by its own id, plus one intentionally open policy:
-- self-serve signup creates a brand-new salon, so there's no existing
-- tenant to check the new row against. This is the one place unconditional
-- INSERT is correct, not a hole.
ALTER TABLE "Salon" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Salon" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Salon";
CREATE POLICY tenant_isolation ON "Salon"
  USING (id = current_setting('app.current_salon_id', true));
DROP POLICY IF EXISTS allow_signup_insert ON "Salon";
CREATE POLICY allow_signup_insert ON "Salon"
  FOR INSERT WITH CHECK (true);

-- Direct salonId column.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Staff', 'Customer', 'Appointment', 'BusinessHours', 'Service', 'Product']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("salonId" = current_setting(''app.current_salon_id'', true)) WITH CHECK ("salonId" = current_setting(''app.current_salon_id'', true))',
      t
    );
  END LOOP;
END
$$;

-- Joined — one hop via staffId -> Staff.salonId.
ALTER TABLE "CommissionRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommissionRule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CommissionRule";
CREATE POLICY tenant_isolation ON "CommissionRule"
  USING ("staffId" IN (SELECT id FROM "Staff" WHERE "salonId" = current_setting('app.current_salon_id', true)))
  WITH CHECK ("staffId" IN (SELECT id FROM "Staff" WHERE "salonId" = current_setting('app.current_salon_id', true)));

-- Joined — one hop via appointmentId -> Appointment.salonId.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Transaction', 'Deposit']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("appointmentId" IN (SELECT id FROM "Appointment" WHERE "salonId" = current_setting(''app.current_salon_id'', true))) WITH CHECK ("appointmentId" IN (SELECT id FROM "Appointment" WHERE "salonId" = current_setting(''app.current_salon_id'', true)))',
      t
    );
  END LOOP;
END
$$;

-- Joined — two hops via transactionId -> Transaction -> Appointment.salonId.
-- Keyed off transactionId (always present) rather than the nullable
-- staffId column.
ALTER TABLE "TransactionSplit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TransactionSplit" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TransactionSplit";
CREATE POLICY tenant_isolation ON "TransactionSplit"
  USING ("transactionId" IN (
    SELECT t.id FROM "Transaction" t
    JOIN "Appointment" a ON a.id = t."appointmentId"
    WHERE a."salonId" = current_setting('app.current_salon_id', true)
  ))
  WITH CHECK ("transactionId" IN (
    SELECT t.id FROM "Transaction" t
    JOIN "Appointment" a ON a.id = t."appointmentId"
    WHERE a."salonId" = current_setting('app.current_salon_id', true)
  ));

-- ---------------------------------------------------------------------------
-- 3. Three narrow, audited escape hatches.
--
-- RLS is intentionally strict, but three real operations are legitimately
-- cross-tenant by nature. Each gets exactly one purpose-built SQL function
-- rather than any blanket bypass — SECURITY DEFINER means it runs with the
-- privileges of whoever owns it (postgres, unrestricted), regardless of
-- which role calls it, so app_runtime can call these three specific
-- functions and nothing else outside its own tenant.
-- ---------------------------------------------------------------------------

-- Login doesn't know the salon until *after* finding the phone. Also reused
-- for the phone-uniqueness pre-check in signup and staff creation --
-- Staff.phone is globally unique, not per-salon.
CREATE OR REPLACE FUNCTION find_staff_by_phone(p_phone text)
RETURNS TABLE(id text, "salonId" text, name text, "passwordHash" text, role text, active boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id, "salonId", name, "passwordHash", role::text, active FROM "Staff" WHERE phone = p_phone;
$$;
GRANT EXECUTE ON FUNCTION find_staff_by_phone(text) TO app_runtime;

-- The Paystack webhook's subscription.disable event carries only a
-- subscription_code, no salon reference at all.
CREATE OR REPLACE FUNCTION find_salon_id_by_subscription_code(p_code text)
RETURNS TABLE(id text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM "Salon" WHERE "paystackSubscriptionCode" = p_code;
$$;
GRANT EXECUTE ON FUNCTION find_salon_id_by_subscription_code(text) TO app_runtime;

-- The two cron jobs (hold-sweep, reminders) each sweep every salon in one
-- pass today; under RLS they iterate salon-by-salon instead. IDs only,
-- nothing sensitive.
CREATE OR REPLACE FUNCTION list_all_salon_ids()
RETURNS TABLE(id text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM "Salon";
$$;
GRANT EXECUTE ON FUNCTION list_all_salon_ids() TO app_runtime;

-- ---------------------------------------------------------------------------
-- Fifth escape hatch, and a fix for a real bug the live-verification pass
-- caught: the `allow_signup_insert` permissive policy on "Salon" (see
-- 20260921063143_row_level_security) only covers the INSERT's own WITH
-- CHECK. Prisma's create() always does INSERT ... RETURNING *, and that
-- RETURNING is governed by the SELECT-side policy, not the INSERT one --
-- "tenant_isolation" is the only policy covering SELECT, and its check
-- (id = current_setting('app.current_salon_id')) fails for a brand-new
-- salon with no tenant context yet open. Result, confirmed live: every
-- self-serve signup failed with "new row violates row-level security policy
-- for table Salon" even though the INSERT itself was permitted.
--
-- A permissive SELECT policy can't fix this without reopening Salon to
-- cross-tenant reads everywhere else (permissive policies OR together), so
-- this uses the same SECURITY DEFINER pattern as the other four escape
-- hatches instead: runs as postgres (BYPASSRLS), so both the insert and its
-- own RETURNING succeed regardless of any policy, and nothing else about
-- Salon's RLS changes.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_salon(p_name text, p_city text, p_trial_ends_at timestamptz)
RETURNS "Salon"
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result "Salon";
BEGIN
  INSERT INTO "Salon" (id, name, city, "trialEndsAt", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, p_name, p_city, p_trial_ends_at, now(), now())
  RETURNING * INTO result;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION create_salon(text, text, timestamptz) TO app_runtime;

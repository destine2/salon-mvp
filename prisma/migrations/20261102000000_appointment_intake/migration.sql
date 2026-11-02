-- Optional consultation answers captured on the public booking form
-- (areas of focus, draping preference, skin type, notes, policy consent).
-- JSONB rather than columns: the question set differs per kind of salon/spa
-- and will keep changing. Covered by the existing Appointment RLS policy.
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "intake" JSONB;

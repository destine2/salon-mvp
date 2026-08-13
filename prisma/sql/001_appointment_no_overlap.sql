-- Prevent double-booking at the database level.
--
-- WHY THIS IS NOT APPLICATION CODE
--
-- src/lib/scheduling.ts#isSlotAvailable reads existing appointments and then
-- the caller inserts. Between those two statements another request can insert
-- the same slot: both reads see "free", both writes succeed, and two customers
-- arrive for the same stylist. No error is raised, so nobody notices until
-- they are both standing in the salon.
--
-- That failure mode is exactly what PRD 5.1 forbids as a Must (MVP) criterion:
--   "no two bookings can occupy the same staff+time slot without an explicit
--    override"
-- and it is the risk PRD 11 expects to resolve as "first synced wins with a
-- visible conflict notice rather than silent overwrite" — which only holds if
-- the second write actually fails. This constraint is what makes it fail.
--
-- It matters more than usual here because the offline sync queue replays
-- writes in bursts on reconnect, which is precisely the concurrent pattern
-- that triggers the race.
--
-- isSlotAvailable stays as a friendly pre-check so the common case returns a
-- helpful 409 rather than a raw database error. The constraint is the actual
-- guarantee; the check is the good manners.
--
-- APPLY WITH:  psql "$DATABASE_URL" -f prisma/sql/001_appointment_no_overlap.sql
-- Run it after `prisma db push` / `prisma migrate deploy`, and re-run it after
-- any reset — Prisma cannot express exclusion constraints, so it will not
-- recreate this for you.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Backfill endTime for any rows created before the column existed.
UPDATE "Appointment" a
SET "endTime" = a."startTime" + (s."durationMin" * INTERVAL '1 minute')
FROM "Service" s
WHERE a."serviceId" = s.id
  AND a."endTime" IS NULL;

-- '[)' — a booking ending at 12:00 does not conflict with one starting at
-- 12:00. Only live statuses participate: CANCELLED and NO_SHOW free the slot,
-- matching ACTIVE_STATUSES in src/lib/scheduling.ts.
ALTER TABLE "Appointment"
    DROP CONSTRAINT IF EXISTS appointment_no_overlap;

ALTER TABLE "Appointment"
    ADD CONSTRAINT appointment_no_overlap
    EXCLUDE USING gist (
        "staffId" WITH =,
        tstzrange("startTime", "endTime", '[)') WITH &&
    )
    WHERE (status IN ('BOOKED', 'CONFIRMED', 'COMPLETED'));

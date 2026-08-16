-- Hand-written rather than `prisma migrate dev`: that command needs a shadow
-- database to compute the diff, which requires CREATE DATABASE privileges the
-- Supabase pooler doesn't grant, and the direct (non-pooled) host is
-- unreachable from this network (IPv6-only, no route). `migrate deploy`
-- applies migration files without needing a shadow database, so that's the
-- path used here and in production.
--
-- startTime/endTime were `timestamp` (no timezone). They represent absolute
-- instants, computed via src/lib/lagos-time.ts, so timestamptz is the
-- correct type regardless of the constraint below — but it is also required
-- BY the constraint: prisma/sql/001_appointment_no_overlap.sql needs these
-- as timestamptz to avoid Postgres inserting an implicit timestamp ->
-- timestamptz cast, which is STABLE and gets rejected inside an index
-- expression ("functions in index expression must be marked IMMUTABLE").
--
-- USING "startTime" AT TIME ZONE 'UTC' is the correct reinterpretation:
-- Prisma writes DateTime values to a bare `timestamp` column as their UTC
-- wall-clock representation, so treating the existing naive value as UTC
-- (rather than converting it, which AT TIME ZONE without a source zone would
-- otherwise do differently) preserves every existing row's real instant
-- exactly. There is no data to migrate yet, but this is the correct
-- transformation for any that exist.
ALTER TABLE "Appointment"
    ALTER COLUMN "startTime" TYPE timestamptz(3) USING "startTime" AT TIME ZONE 'UTC',
    ALTER COLUMN "endTime" TYPE timestamptz(3) USING "endTime" AT TIME ZONE 'UTC';

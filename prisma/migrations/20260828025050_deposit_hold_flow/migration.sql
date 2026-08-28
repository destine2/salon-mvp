-- Hand-written rather than `prisma migrate dev` — see the header of
-- 20260816095500_appointment_times_timestamptz/migration.sql for why
-- (no shadow-database access against the Supabase pooler). Applied via
-- `migrate deploy`.
--
-- Adds the deposit-hold booking flow: a salon can opt in (depositPercent >
-- 0) to reserving a slot as HELD with a short expiry until a deposit is
-- paid, instead of booking straight to BOOKED. See PRODUCT.md and the plan
-- doc's "Next: deposit-hold booking flow" section for the full design.
--
-- Note on ALTER TYPE ... ADD VALUE: safe to run alongside the other DDL
-- below in one migration because nothing here uses the new 'HELD' value in
-- a DML statement in this same transaction — Postgres only restricts using
-- a freshly-added enum value as *data* within the transaction that added
-- it, not unrelated DDL after it.
ALTER TABLE "Salon" ADD COLUMN "depositPercent" INTEGER NOT NULL DEFAULT 0;

ALTER TYPE "AppointmentStatus" ADD VALUE 'HELD';

ALTER TABLE "Appointment" ADD COLUMN "holdExpiresAt" TIMESTAMPTZ(3);

CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'PAID');

CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "amountNaira" DECIMAL(10,2) NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'PENDING',
    "paystackRef" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Deposit_appointmentId_key" ON "Deposit"("appointmentId");

ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_appointmentId_fkey"
    FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

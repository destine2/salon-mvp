-- Email notifications: where the salon's new-booking alerts go, an optional
-- customer email for confirmations/reminders, and sent-markers for the two
-- new reminder types (3 days before, morning of). Existing RLS policies on
-- Salon/Customer/Appointment already cover the new columns.
ALTER TABLE "Salon" ADD COLUMN IF NOT EXISTS "notifyEmail" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "reminder72SentAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "reminderMorningSentAt" TIMESTAMP(3);

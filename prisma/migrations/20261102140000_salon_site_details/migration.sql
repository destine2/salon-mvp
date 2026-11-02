-- Contact details the salon's public website reads live (see
-- /api/public/salons/[salonId]/site). Covered by Salon's existing RLS policy.
ALTER TABLE "Salon" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
ALTER TABLE "Salon" ADD COLUMN IF NOT EXISTS "whatsappNumber" TEXT;
ALTER TABLE "Salon" ADD COLUMN IF NOT EXISTS "address" TEXT;

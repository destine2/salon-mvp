import { PrismaClient, StaffRole, CommissionType } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

// Dev-only trusted script — connects as the unrestricted postgres role
// (MIGRATION_DATABASE_URL) rather than the RLS-restricted app_runtime role
// DATABASE_URL now points the running app at, since seeding legitimately
// creates data with no tenant context open yet.
const prisma = new PrismaClient({ datasources: { db: { url: process.env.MIGRATION_DATABASE_URL } } });

async function main() {
  const salon = await prisma.salon.upsert({
    where: { id: "seed-salon" },
    update: {},
    create: {
      id: "seed-salon",
      name: "Test Salon (Yaba)",
      city: "Lagos",
    },
  });

  const ownerPhone = "2348000000000";
  // Change this before seeding anything beyond local dev — re-running the
  // seed resets it, which is convenient for testing and exactly why it
  // shouldn't still be the default anywhere real.
  const ownerPassword = "changeme123";

  const owner = await prisma.staff.upsert({
    where: { phone: ownerPhone },
    update: { passwordHash: hashPassword(ownerPassword) },
    create: {
      salonId: salon.id,
      name: "Owner",
      phone: ownerPhone,
      passwordHash: hashPassword(ownerPassword),
      role: StaffRole.OWNER,
    },
  });

  await prisma.commissionRule.upsert({
    where: { staffId: owner.id },
    update: {},
    create: {
      staffId: owner.id,
      type: CommissionType.PERCENT,
      value: 100, // owner keeps 100% by default — add staff with their own rule via Staff CRUD (Phase 2)
    },
  });

  console.log("Seeded:", { salon: salon.name, owner: owner.phone, password: ownerPassword });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

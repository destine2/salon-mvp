import { PrismaClient, StaffRole, CommissionType } from "@prisma/client";

const prisma = new PrismaClient();

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

  // Replace this phone number with your own before running the seed, so the
  // OTP actually lands somewhere you can read it during local testing.
  const ownerPhone = "2348000000000";

  const owner = await prisma.staff.upsert({
    where: { phone: ownerPhone },
    update: {},
    create: {
      salonId: salon.id,
      name: "Owner",
      phone: ownerPhone,
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

  console.log("Seeded:", { salon: salon.name, owner: owner.phone });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

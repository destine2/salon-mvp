/**
 * The one test that proves the double-booking fix — not simulated, not
 * inferred from reading the SQL, but a real concurrency race against a real
 * Postgres connection.
 *
 * Every other test in this project is a pure function test: given these
 * inputs, assert this output, no database involved. That's necessary but not
 * sufficient here, because the actual claim — "two simultaneous bookings for
 * the same slot cannot both succeed" — is a property of the database, not of
 * any function in this codebase. isSlotAvailable() passing sequentially
 * proves nothing about the race: both requests can pass that check if they
 * run before either has written. Only firing genuinely concurrent writes at
 * Postgres and watching what survives can prove this.
 *
 * This was originally a throwaway script, run once by hand against the live
 * Supabase database on 2026-08-16 (see commit 181a5f7), then deleted. Result
 * at the time: 8 concurrent inserts, 1 succeeded, 7 rejected with SQLSTATE
 * 23P01 naming "appointment_no_overlap", exactly 1 row landed in the table.
 * That result was real but not reproducible — the only record of it was a
 * commit message. This file exists so the same proof can be re-run any time
 * the schema, the constraint, or Prisma changes, rather than trusting that a
 * fix made once in August still holds.
 *
 * SKIPPED BY DEFAULT. This talks to a real database, creates and deletes real
 * rows, and needs DATABASE_URL pointed at a database you're fine writing
 * throwaway data into — never point this at production. Run explicitly:
 *
 *   RUN_CONCURRENCY_TEST=1 node --import tsx --test src/lib/overlap.concurrency.test.ts
 *
 * Not part of `npm test` for the same reason: a live-database test in the
 * default suite means every contributor needs working DB credentials just to
 * typecheck their pure-function changes, and CI would need real Postgres
 * wired up for a check that's about infrastructure behavior, not code.
 */

import test from "node:test";
import assert from "node:assert";

const RUN = process.env.RUN_CONCURRENCY_TEST === "1";

test("exactly one concurrent booking wins the race for an identical slot", { skip: !RUN }, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const N = 8;

  const salon = await prisma.salon.create({ data: { name: "Concurrency Test Salon" } });
  try {
    const staff = await prisma.staff.create({
      data: { salonId: salon.id, name: "Test Stylist", phone: `+234concurrency${Date.now()}`, role: "OWNER" },
    });
    const service = await prisma.service.create({
      data: { salonId: salon.id, name: "Test Service", priceNaira: 5000, durationMin: 60 },
    });

    const customers = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        prisma.customer.create({
          data: { salonId: salon.id, phone: `+234concurrency${Date.now()}-${i}`, name: `Customer ${i}` },
        })
      )
    );

    const start = new Date("2099-01-01T10:00:00.000Z");
    const end = new Date("2099-01-01T11:00:00.000Z");

    // The point of the test: no pre-check, no isSlotAvailable() — straight
    // through the client, exactly as if N customers tapped "book" on the
    // same slot in the same instant. Only the database can arbitrate this.
    const attempts = await Promise.allSettled(
      customers.map((customer) =>
        prisma.appointment.create({
          data: {
            salonId: salon.id,
            staffId: staff.id,
            serviceId: service.id,
            customerId: customer.id,
            startTime: start,
            endTime: end,
            status: "BOOKED",
          },
        })
      )
    );

    const succeeded = attempts.filter((a) => a.status === "fulfilled");
    const failed = attempts.filter(
      (a): a is PromiseRejectedResult => a.status === "rejected"
    );
    const exclusionRejections = failed.filter((a) => {
      const msg = String(a.reason?.message ?? "");
      return msg.includes("appointment_no_overlap") || msg.includes("23P01");
    });

    const actualRows = await prisma.appointment.count({
      where: { staffId: staff.id, status: { in: ["BOOKED", "CONFIRMED", "COMPLETED"] } },
    });

    assert.strictEqual(succeeded.length, 1, "exactly one booking should win the race");
    assert.strictEqual(failed.length, N - 1, "every other attempt should fail");
    assert.strictEqual(
      exclusionRejections.length,
      N - 1,
      "every failure should be the exclusion constraint specifically, not some other error"
    );
    assert.strictEqual(actualRows, 1, "exactly one row should exist for the slot afterward");
  } finally {
    // Cascading deletes on Salon would work, but cleaning up explicitly
    // keeps this test's blast radius obvious on read rather than implicit.
    await prisma.appointment.deleteMany({ where: { salonId: salon.id } });
    await prisma.customer.deleteMany({ where: { salonId: salon.id } });
    await prisma.service.deleteMany({ where: { salonId: salon.id } });
    await prisma.staff.deleteMany({ where: { salonId: salon.id } });
    await prisma.salon.delete({ where: { id: salon.id } });
    await prisma.$disconnect();
  }
});

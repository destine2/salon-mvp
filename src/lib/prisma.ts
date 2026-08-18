import { PrismaClient } from "@prisma/client";

// Standard Next.js singleton pattern — avoids exhausting the Postgres
// connection pool from hot-reloading in dev.
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    // Global, not per-route: Staff is returned to the browser from a dozen
    // places (staff list, every appointment's nested staff, reports...).
    // Omitting it once here means no future route can leak it by forgetting
    // a select. The one legitimate reader of the real hash (auth/login)
    // overrides this per-query with `omit: { passwordHash: false }`.
    omit: { staff: { passwordHash: true } },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

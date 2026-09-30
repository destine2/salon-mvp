import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type Tx = Prisma.TransactionClient;

/**
 * Opens the per-request tenant context that Postgres RLS policies check
 * (see prisma/migrations/20260921063143_row_level_security). Every query
 * that touches tenant-scoped data must run through the `tx` this hands to
 * `fn` — the bare `prisma` client, once DATABASE_URL is the restricted
 * app_runtime role, sees nothing at all outside a transaction that's set
 * this session variable first.
 *
 * `set_config(..., true)` rather than a raw `SET LOCAL app.current_salon_id
 * = '${salonId}'` — this is the function form specifically because it takes
 * a normal parameterized argument through Prisma's tagged-template
 * `$executeRaw`. Plain `SET LOCAL` can't be parameterized safely, and
 * string-interpolating a salonId into raw SQL is exactly the kind of thing
 * to never do even when the value is normally an internal cuid.
 *
 * `true` (is_local) mirrors SET LOCAL's scoping: the setting reverts the
 * moment this transaction ends, never leaking into a connection the pool
 * hands to an unrelated request next.
 */
export async function withTenant<T>(salonId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_salon_id', ${salonId}, true)`;
    return fn(tx);
  });
}

export type StaffByPhone = {
  id: string;
  salonId: string;
  name: string;
  passwordHash: string | null;
  role: "OWNER" | "STYLIST" | "APPRENTICE";
  active: boolean;
};

/**
 * The `find_staff_by_phone` SECURITY DEFINER escape hatch (see the RLS
 * migration) — `Staff.phone` is globally unique, not per-salon, so both
 * login and the phone-uniqueness pre-checks (signup, staff creation) need
 * to look a phone up before any salon context exists to scope by.
 */
export async function findStaffByPhone(phone: string): Promise<StaffByPhone | null> {
  const rows = await prisma.$queryRaw<StaffByPhone[]>`
    SELECT * FROM find_staff_by_phone(${phone})
  `;
  return rows[0] ?? null;
}

/**
 * The `find_salon_id_by_appointment_id` SECURITY DEFINER escape hatch (see
 * prisma/migrations/20260921070000_appointment_salon_lookup) — several
 * payment-callback routes (checkout verify, both deposit routes) are keyed
 * only by an appointmentId in a Paystack reference, with no session and no
 * salonId anywhere else in the request to open `withTenant` with directly.
 */
export async function findSalonIdByAppointmentId(appointmentId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT * FROM find_salon_id_by_appointment_id(${appointmentId})
  `;
  return rows[0]?.id ?? null;
}

/**
 * The `find_salon_id_by_subscription_code` SECURITY DEFINER escape hatch —
 * the Paystack webhook's `subscription.disable` event carries only a
 * subscription_code, no salon reference at all.
 */
export async function findSalonIdBySubscriptionCode(code: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT * FROM find_salon_id_by_subscription_code(${code})
  `;
  return rows[0]?.id ?? null;
}

/**
 * The `list_all_salon_ids` SECURITY DEFINER escape hatch — the two cron jobs
 * (hold-sweep, reminders) sweep every salon in one pass; under RLS they
 * iterate salon-by-salon instead, each iteration inside its own `withTenant`.
 */
export async function listAllSalonIds(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT * FROM list_all_salon_ids()`;
  return rows.map((r) => r.id);
}

export type NewSalon = {
  id: string;
  name: string;
  city: string | null;
  tier: "FREE" | "STARTER" | "GROWTH" | "MULTI_BRANCH" | "PAID";
  depositPercent: number;
  trialEndsAt: Date | null;
};

/**
 * The `create_salon` SECURITY DEFINER escape hatch (see
 * prisma/migrations/20260921071500_create_salon_function) — self-serve
 * signup creates a brand-new salon with no existing tenant to scope by.
 *
 * A permissive INSERT-only policy alone isn't enough here: Prisma's
 * create() always does INSERT ... RETURNING *, and that RETURNING is
 * governed by the SELECT-side policy, which has no tenant context to pass
 * yet either. Running the insert (and its own RETURNING) as postgres
 * sidesteps that rather than opening Salon's SELECT policy to everyone.
 */
export async function createSalon(params: { name: string; city: string | null; trialEndsAt: Date }): Promise<NewSalon> {
  const rows = await prisma.$queryRaw<NewSalon[]>`
    SELECT * FROM create_salon(${params.name}, ${params.city}, ${params.trialEndsAt})
  `;
  return rows[0];
}

import { listAllSalonIds, withTenant } from "@/lib/tenant";

/**
 * Releases any HELD appointment whose hold has expired — the customer never
 * paid the deposit in time. Cancelling (not deleting) frees the slot for the
 * exclusion constraint immediately, since CANCELLED isn't in its WHERE
 * clause (prisma/sql/001_appointment_no_overlap.sql), while keeping the row
 * for the owner's own record.
 *
 * Runs on a schedule (see /api/cron/release-expired-holds +
 * .github/workflows/release-expired-holds.yml), every 5 minutes — tighter
 * than the reminder cron's 15, because a 10-minute hold needs finer-grained
 * sweeping than a 24h/2h reminder window does.
 *
 * Under RLS there's no single cross-tenant query anymore — this sweeps every
 * salon in one pass via the list_all_salon_ids() escape hatch, then does the
 * actual update inside each salon's own tenant context.
 */
export async function releaseExpiredHolds() {
  const salonIds = await listAllSalonIds();
  let released = 0;
  for (const salonId of salonIds) {
    const result = await withTenant(salonId, (tx) =>
      tx.appointment.updateMany({
        where: { salonId, status: "HELD", holdExpiresAt: { lt: new Date() } },
        data: { status: "CANCELLED", holdExpiresAt: null },
      })
    );
    released += result.count;
  }
  return { released };
}

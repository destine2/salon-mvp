import { NextResponse } from "next/server";
import { listAllSalonIds } from "@/lib/tenant";

// Quick sanity check for Week 0: confirms the app can reach Postgres
// through Prisma before we build anything on top of it. Goes through the
// list_all_salon_ids() escape hatch rather than a raw prisma.salon.count() —
// under RLS the bare client sees nothing outside a tenant context, and this
// is the one sanctioned cross-tenant read, still a real connectivity+query
// check.
export async function GET() {
  try {
    const salonCount = (await listAllSalonIds()).length;
    return NextResponse.json({ ok: true, salonCount });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

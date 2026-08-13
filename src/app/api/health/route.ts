import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Quick sanity check for Week 0: confirms the app can reach Postgres
// through Prisma before we build anything on top of it.
export async function GET() {
  try {
    const salonCount = await prisma.salon.count();
    return NextResponse.json({ ok: true, salonCount });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

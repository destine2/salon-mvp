import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { requireOwnerSession } from "@/lib/require-owner";
import { withTenant } from "@/lib/tenant";

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });

  const services = await withTenant(session.salonId, (tx) =>
    tx.service.findMany({
      where: { salonId: session.salonId },
      orderBy: { name: "asc" },
    })
  );
  return NextResponse.json({ ok: true, services });
}

export async function POST(req: NextRequest) {
  const { session, error } = requireOwnerSession();
  if (error) return error;

  const { name, priceNaira, durationMin } = await req.json();
  if (!name || priceNaira == null) {
    return NextResponse.json({ ok: false, error: "name and priceNaira are required" }, { status: 400 });
  }

  const service = await withTenant(session!.salonId, (tx) =>
    tx.service.create({
      data: {
        salonId: session!.salonId,
        name,
        priceNaira,
        durationMin: durationMin ?? 60,
      },
    })
  );
  return NextResponse.json({ ok: true, service });
}

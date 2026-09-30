import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { requireOwnerSession } from "@/lib/require-owner";
import { isEntitled } from "@/lib/billing";
import { withTenant } from "@/lib/tenant";

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });

  const salon = await withTenant(session.salonId, (tx) => tx.salon.findUnique({ where: { id: session.salonId } }));
  if (!salon) return NextResponse.json({ ok: false, error: "Salon not found" }, { status: 404 });

  return NextResponse.json({ ok: true, salon });
}

export async function PATCH(req: NextRequest) {
  const { session, error } = requireOwnerSession();
  if (error) return error;

  const { depositPercent } = await req.json();
  if (depositPercent == null || !Number.isInteger(depositPercent) || depositPercent < 0 || depositPercent > 100) {
    return NextResponse.json({ ok: false, error: "depositPercent must be a whole number from 0 to 100" }, { status: 400 });
  }

  const salon = await withTenant(session!.salonId, async (tx) => {
    if (depositPercent > 0) {
      const current = await tx.salon.findUnique({ where: { id: session!.salonId } });
      if (current && !isEntitled(current)) {
        return "not-entitled" as const;
      }
    }
    return tx.salon.update({ where: { id: session!.salonId }, data: { depositPercent } });
  });

  if (salon === "not-entitled") {
    return NextResponse.json({ ok: false, error: "Deposits are a paid-plan feature — upgrade to turn them on." }, { status: 403 });
  }

  return NextResponse.json({ ok: true, salon });
}

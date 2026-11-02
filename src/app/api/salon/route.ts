import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { requireOwnerSession } from "@/lib/require-owner";
import { isEntitled } from "@/lib/billing";
import { withTenant } from "@/lib/tenant";
import { isValidEmail } from "@/lib/email";

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

  const body = await req.json();
  const { depositPercent } = body;
  const data: { depositPercent?: number; notifyEmail?: string | null; contactPhone?: string | null; whatsappNumber?: string | null; address?: string | null } = {};

  for (const [key, max, pattern] of [
    ["contactPhone", 30, /^[+\d\s()-]+$/],
    ["whatsappNumber", 20, /^\d+$/],
    ["address", 200, null],
  ] as const) {
    const v = body[key];
    if (v === undefined) continue;
    const t = typeof v === "string" ? v.trim() : "";
    if (t === "") data[key] = null;
    else if (t.length > max || (pattern && !pattern.test(t))) {
      const hint = key === "whatsappNumber" ? "digits only, with country code, e.g. 2348012345678" : key === "contactPhone" ? "digits, spaces, + and - only" : "too long";
      return NextResponse.json({ ok: false, error: `Invalid ${key}: ${hint}` }, { status: 400 });
    } else data[key] = t;
  }

  if (body.notifyEmail !== undefined) {
    if (body.notifyEmail === "" || body.notifyEmail === null) data.notifyEmail = null;
    else if (isValidEmail(body.notifyEmail)) data.notifyEmail = body.notifyEmail.trim().toLowerCase();
    else return NextResponse.json({ ok: false, error: "That doesn't look like a valid email address." }, { status: 400 });
  }
  if (depositPercent !== undefined) {
    if (!Number.isInteger(depositPercent) || depositPercent < 0 || depositPercent > 100) {
      return NextResponse.json({ ok: false, error: "depositPercent must be a whole number from 0 to 100" }, { status: 400 });
    }
    data.depositPercent = depositPercent;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  }

  const salon = await withTenant(session!.salonId, async (tx) => {
    if (data.depositPercent !== undefined && data.depositPercent > 0) {
      const current = await tx.salon.findUnique({ where: { id: session!.salonId } });
      if (current && !isEntitled(current)) {
        return "not-entitled" as const;
      }
    }
    return tx.salon.update({ where: { id: session!.salonId }, data });
  });

  if (salon === "not-entitled") {
    return NextResponse.json({ ok: false, error: "Deposits are a paid-plan feature — upgrade to turn them on." }, { status: 403 });
  }

  return NextResponse.json({ ok: true, salon });
}

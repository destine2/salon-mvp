import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendOtp } from "@/lib/termii";

export async function POST(req: NextRequest) {
  const { phone } = await req.json();
  if (!phone) {
    return NextResponse.json({ ok: false, error: "phone is required" }, { status: 400 });
  }

  // MVP scope: staff/owners are pre-registered by the seed script or Staff
  // CRUD (Phase 2) — there's no public self-signup flow yet.
  const staff = await prisma.staff.findUnique({ where: { phone } });
  if (!staff) {
    return NextResponse.json(
      { ok: false, error: "This phone number isn't registered to a salon yet." },
      { status: 404 }
    );
  }
  if (!staff.active) {
    return NextResponse.json({ ok: false, error: "This account has been deactivated." }, { status: 403 });
  }

  const result = await sendOtp(phone);
  return NextResponse.json({ ok: true, pinId: result.pinId });
}

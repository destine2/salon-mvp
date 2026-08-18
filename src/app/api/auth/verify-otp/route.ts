import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyOtp } from "@/lib/termii";
import { createSessionToken } from "@/lib/session";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { phone, pinId, pin } = await req.json();
  if (!phone || !pinId || !pin) {
    return NextResponse.json(
      { ok: false, error: "phone, pinId, and pin are required" },
      { status: 400 }
    );
  }

  const result = await verifyOtp(pinId, pin);
  if (!result?.verified) {
    return NextResponse.json({ ok: false, error: "Incorrect or expired code." }, { status: 401 });
  }

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

  const token = createSessionToken({ staffId: staff.id, salonId: staff.salonId, role: staff.role });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return NextResponse.json({ ok: true, staffId: staff.id, role: staff.role });
}

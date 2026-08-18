import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createSessionToken } from "@/lib/session";
import { SESSION_COOKIE } from "@/lib/auth";

// Phone + password. Termii OTP-SMS used to sit here, but Termii is a paid
// API and its sender ID is still pending approval — that made SMS the one
// thing standing between an owner and their own dashboard. Termii is kept
// for appointment reminders (src/lib/termii.ts), just not for login.
export async function POST(req: NextRequest) {
  const { phone, password } = await req.json();
  if (!phone || !password) {
    return NextResponse.json({ ok: false, error: "phone and password are required" }, { status: 400 });
  }

  // Overrides the global omit in lib/prisma.ts — this is the one place
  // that legitimately needs the real hash to check it.
  const staff = await prisma.staff.findUnique({ where: { phone }, omit: { passwordHash: false } });
  // Same error for "no such phone" and "wrong password" — a login form
  // shouldn't confirm which phone numbers are registered.
  const invalid = () => NextResponse.json({ ok: false, error: "Incorrect phone number or password." }, { status: 401 });

  if (!staff || !staff.passwordHash) {
    return invalid();
  }
  if (!staff.active) {
    return NextResponse.json({ ok: false, error: "This account has been deactivated." }, { status: 403 });
  }
  if (!verifyPassword(password, staff.passwordHash)) {
    return invalid();
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

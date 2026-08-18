import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { createSessionToken } from "@/lib/session";
import { SESSION_COOKIE } from "@/lib/auth";
import { CommissionType, StaffRole } from "@prisma/client";

// Public, unauthenticated — creates a brand-new salon and its owner
// account, then logs them straight in. Previously the only way a salon
// entered the system was prisma/seed.ts hardcoding one; this is what
// self-serve onboarding actually means (PRD's Phase 4).
export async function POST(req: NextRequest) {
  const { salonName, city, ownerName, phone, password } = await req.json();
  if (!salonName || !ownerName || !phone || !password) {
    return NextResponse.json(
      { ok: false, error: "salonName, ownerName, phone, and password are required" },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = await prisma.staff.findUnique({ where: { phone } });
  if (existing) {
    return NextResponse.json({ ok: false, error: "That phone number is already registered." }, { status: 409 });
  }

  // Salon + owner + their default commission rule together, so a failure
  // partway through (e.g. the phone race above losing to a concurrent
  // signup) can't leave an orphaned salon with no owner.
  let owner;
  try {
    owner = await prisma.$transaction(async (tx) => {
      const salon = await tx.salon.create({
        data: { name: salonName, city: city || null },
      });
      const staff = await tx.staff.create({
        data: {
          salonId: salon.id,
          name: ownerName,
          phone,
          passwordHash: hashPassword(password),
          role: StaffRole.OWNER,
        },
      });
      await tx.commissionRule.create({
        data: { staffId: staff.id, type: CommissionType.PERCENT, value: 100 },
      });
      return staff;
    });
  } catch {
    // Same phone-uniqueness race the pre-check above can lose.
    return NextResponse.json({ ok: false, error: "That phone number is already registered." }, { status: 409 });
  }

  const token = createSessionToken({ staffId: owner.id, salonId: owner.salonId, role: owner.role });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return NextResponse.json({ ok: true, staffId: owner.id });
}

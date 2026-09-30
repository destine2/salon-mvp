import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hashPassword } from "@/lib/password";
import { createSessionToken } from "@/lib/session";
import { SESSION_COOKIE } from "@/lib/auth";
import { CommissionType, StaffRole } from "@prisma/client";
import { TRIAL_DAYS } from "@/lib/billing";
import { createSalon, findStaffByPhone, withTenant } from "@/lib/tenant";

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

  const existing = await findStaffByPhone(phone);
  if (existing) {
    return NextResponse.json({ ok: false, error: "That phone number is already registered." }, { status: 409 });
  }

  // Salon first, via the create_salon() escape hatch — there's no existing
  // tenant to open a context for yet, and (confirmed live) a permissive
  // INSERT-only policy isn't actually enough on its own: Prisma's create()
  // always does INSERT ... RETURNING *, and that RETURNING is governed by
  // the SELECT-side policy, which has nothing to check against either. See
  // src/lib/tenant.ts#createSalon. Staff and CommissionRule, in contrast,
  // are scoped by salonId, so they need a real tenant context — which can
  // only be opened once the salon's id exists. That means this can no
  // longer be one atomic transaction the way it was before RLS (Prisma's
  // transaction client can't nest $transaction calls); a failure creating
  // the staff row (e.g. losing the phone-uniqueness race below) can now
  // leave an orphaned salon with no owner. Same category as this app's
  // other deliberately-flagged edges (refunds, cash shortfalls) rather than
  // a silent regression.
  const salon = await createSalon({
    name: salonName,
    city: city || null,
    trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60_000),
  });

  let owner;
  try {
    owner = await withTenant(salon.id, async (tx) => {
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

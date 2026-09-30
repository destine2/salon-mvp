import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { requireOwnerSession } from "@/lib/require-owner";
import { hashPassword } from "@/lib/password";
import { StaffRole, CommissionType } from "@prisma/client";
import { isEntitled, FREE_TIER_STAFF_LIMIT } from "@/lib/billing";
import { withTenant, findStaffByPhone } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });

  // The staff management page needs everyone, active or not, to offer
  // reactivate/permanently-remove. Callers that only need people who can
  // actually be booked (calendar dropdowns) pass ?active=true to filter.
  const activeOnly = req.nextUrl.searchParams.get("active") === "true";

  const staff = await withTenant(session.salonId, (tx) =>
    tx.staff.findMany({
      where: { salonId: session.salonId, ...(activeOnly ? { active: true } : {}) },
      include: { commissionRule: true },
      orderBy: { name: "asc" },
    })
  );
  return NextResponse.json({ ok: true, staff });
}

export async function POST(req: NextRequest) {
  const { session, error } = requireOwnerSession();
  if (error) return error;

  const { name, phone, password, role, commissionType, commissionValue } = await req.json();
  if (!name || !phone || !password || !commissionType || commissionValue == null) {
    return NextResponse.json(
      { ok: false, error: "name, phone, password, commissionType, and commissionValue are required" },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
  }

  // Staff.phone is globally unique, not per-salon — genuinely cross-tenant,
  // hence the escape-hatch lookup rather than a tenant-scoped query.
  const existing = await findStaffByPhone(phone);
  if (existing) {
    return NextResponse.json({ ok: false, error: "That phone number is already registered" }, { status: 409 });
  }

  const resolvedRole = (role as StaffRole) ?? StaffRole.STYLIST;

  const result = await withTenant(session!.salonId, async (tx) => {
    const salon = await tx.salon.findUnique({ where: { id: session!.salonId } });
    if (salon && !isEntitled(salon)) {
      const activeCount = await tx.staff.count({ where: { salonId: session!.salonId, active: true } });
      if (activeCount >= FREE_TIER_STAFF_LIMIT) {
        return "over-limit" as const;
      }
    }

    return tx.staff.create({
      data: {
        salonId: session!.salonId,
        name,
        phone,
        passwordHash: hashPassword(password),
        role: resolvedRole,
        commissionRule: {
          create: {
            type: commissionType as CommissionType,
            value: commissionValue,
            isApprenticeStipend: resolvedRole === StaffRole.APPRENTICE,
          },
        },
      },
      include: { commissionRule: true },
    });
  });

  if (result === "over-limit") {
    return NextResponse.json(
      { ok: false, error: `Free plan is limited to ${FREE_TIER_STAFF_LIMIT} staff members — upgrade to add more.` },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true, staff: result });
}

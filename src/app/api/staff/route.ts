import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { requireOwnerSession } from "@/lib/require-owner";
import { StaffRole, CommissionType } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });

  // The staff management page needs everyone, active or not, to offer
  // reactivate/permanently-remove. Callers that only need people who can
  // actually be booked (calendar dropdowns) pass ?active=true to filter.
  const activeOnly = req.nextUrl.searchParams.get("active") === "true";

  const staff = await prisma.staff.findMany({
    where: { salonId: session.salonId, ...(activeOnly ? { active: true } : {}) },
    include: { commissionRule: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ ok: true, staff });
}

export async function POST(req: NextRequest) {
  const { session, error } = requireOwnerSession();
  if (error) return error;

  const { name, phone, role, commissionType, commissionValue } = await req.json();
  if (!name || !phone || !commissionType || commissionValue == null) {
    return NextResponse.json(
      { ok: false, error: "name, phone, commissionType, and commissionValue are required" },
      { status: 400 }
    );
  }

  const existing = await prisma.staff.findUnique({ where: { phone } });
  if (existing) {
    return NextResponse.json({ ok: false, error: "That phone number is already registered" }, { status: 409 });
  }

  const resolvedRole = (role as StaffRole) ?? StaffRole.STYLIST;

  const staff = await prisma.staff.create({
    data: {
      salonId: session!.salonId,
      name,
      phone,
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

  return NextResponse.json({ ok: true, staff });
}

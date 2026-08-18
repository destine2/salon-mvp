import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnerSession } from "@/lib/require-owner";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = requireOwnerSession();
  if (error) return error;

  const staff = await prisma.staff.findUnique({ where: { id: params.id } });
  if (!staff || staff.salonId !== session!.salonId) {
    return NextResponse.json({ ok: false, error: "Staff member not found" }, { status: 404 });
  }

  const body = await req.json();

  if (body.active === false && staff.role === "OWNER") {
    return NextResponse.json({ ok: false, error: "Can't deactivate the owner account" }, { status: 400 });
  }

  await prisma.staff.update({
    where: { id: params.id },
    data: {
      name: body.name ?? staff.name,
      role: body.role ?? staff.role,
      active: body.active ?? staff.active,
    },
  });

  if (body.commissionType || body.commissionValue != null) {
    await prisma.commissionRule.upsert({
      where: { staffId: params.id },
      update: {
        type: body.commissionType ?? undefined,
        value: body.commissionValue ?? undefined,
      },
      create: {
        staffId: params.id,
        type: body.commissionType ?? "PERCENT",
        value: body.commissionValue ?? 0,
      },
    });
  }

  const result = await prisma.staff.findUnique({
    where: { id: params.id },
    include: { commissionRule: true },
  });
  return NextResponse.json({ ok: true, staff: result });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = requireOwnerSession();
  if (error) return error;

  const staff = await prisma.staff.findUnique({ where: { id: params.id } });
  if (!staff || staff.salonId !== session!.salonId) {
    return NextResponse.json({ ok: false, error: "Staff member not found" }, { status: 404 });
  }
  if (staff.role === "OWNER") {
    return NextResponse.json({ ok: false, error: "Can't remove the owner account" }, { status: 400 });
  }

  try {
    // CommissionRule doesn't cascade-delete with its Staff row by default,
    // so it has to go first. If the staff member already has appointments
    // or transaction splits, this will still fail — permanently deleting
    // someone with payment history would break every past transaction's
    // "who was this split with" record, so it's left intentional. PATCH
    // { active: false } is the alternative for that case (deactivate keeps
    // the row and its history, just drops it from booking/dropdowns/login).
    await prisma.commissionRule.deleteMany({ where: { staffId: params.id } });
    await prisma.staff.delete({ where: { id: params.id } });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Can't permanently remove this staff member — they already have bookings or payment history attached. Deactivate them instead.",
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/require-owner";
import { hashPassword } from "@/lib/password";
import { withTenant } from "@/lib/tenant";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = requireOwnerSession();
  if (error) return error;

  const body = await req.json();

  const result = await withTenant(session!.salonId, async (tx) => {
    const staff = await tx.staff.findUnique({ where: { id: params.id } });
    if (!staff || staff.salonId !== session!.salonId) {
      return "not-found" as const;
    }

    if (body.active === false && staff.role === "OWNER") {
      return "cant-deactivate-owner" as const;
    }
    if (body.password != null && body.password.length < 8) {
      return "password-too-short" as const;
    }

    await tx.staff.update({
      where: { id: params.id },
      data: {
        name: body.name ?? staff.name,
        role: body.role ?? staff.role,
        active: body.active ?? staff.active,
        passwordHash: body.password ? hashPassword(body.password) : undefined,
      },
    });

    if (body.commissionType || body.commissionValue != null) {
      await tx.commissionRule.upsert({
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

    return tx.staff.findUnique({ where: { id: params.id }, include: { commissionRule: true } });
  });

  if (result === "not-found") return NextResponse.json({ ok: false, error: "Staff member not found" }, { status: 404 });
  if (result === "cant-deactivate-owner") return NextResponse.json({ ok: false, error: "Can't deactivate the owner account" }, { status: 400 });
  if (result === "password-too-short") return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });

  return NextResponse.json({ ok: true, staff: result });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = requireOwnerSession();
  if (error) return error;

  const result = await withTenant(session!.salonId, async (tx) => {
    const staff = await tx.staff.findUnique({ where: { id: params.id } });
    if (!staff || staff.salonId !== session!.salonId) {
      return "not-found" as const;
    }
    if (staff.role === "OWNER") {
      return "cant-remove-owner" as const;
    }

    try {
      // CommissionRule doesn't cascade-delete with its Staff row by default,
      // so it has to go first. If the staff member already has appointments
      // or transaction splits, this will still fail — permanently deleting
      // someone with payment history would break every past transaction's
      // "who was this split with" record, so it's left intentional. PATCH
      // { active: false } is the alternative for that case (deactivate keeps
      // the row and its history, just drops it from booking/dropdowns/login).
      await tx.commissionRule.deleteMany({ where: { staffId: params.id } });
      await tx.staff.delete({ where: { id: params.id } });
      return "ok" as const;
    } catch {
      return "has-history" as const;
    }
  });

  if (result === "not-found") return NextResponse.json({ ok: false, error: "Staff member not found" }, { status: 404 });
  if (result === "cant-remove-owner") return NextResponse.json({ ok: false, error: "Can't remove the owner account" }, { status: 400 });
  if (result === "has-history") {
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

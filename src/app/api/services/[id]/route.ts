import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/require-owner";
import { withTenant } from "@/lib/tenant";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = requireOwnerSession();
  if (error) return error;

  const body = await req.json();

  const result = await withTenant(session!.salonId, async (tx) => {
    const service = await tx.service.findUnique({ where: { id: params.id } });
    if (!service || service.salonId !== session!.salonId) {
      return "not-found" as const;
    }

    return tx.service.update({
      where: { id: params.id },
      data: {
        name: body.name ?? service.name,
        priceNaira: body.priceNaira ?? service.priceNaira,
        durationMin: body.durationMin ?? service.durationMin,
      },
    });
  });

  if (result === "not-found") return NextResponse.json({ ok: false, error: "Service not found" }, { status: 404 });

  return NextResponse.json({ ok: true, service: result });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = requireOwnerSession();
  if (error) return error;

  const result = await withTenant(session!.salonId, async (tx) => {
    const service = await tx.service.findUnique({ where: { id: params.id } });
    if (!service || service.salonId !== session!.salonId) {
      return "not-found" as const;
    }

    await tx.service.delete({ where: { id: params.id } });
    return "ok" as const;
  });

  if (result === "not-found") return NextResponse.json({ ok: false, error: "Service not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}

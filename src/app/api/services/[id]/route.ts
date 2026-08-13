import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnerSession } from "@/lib/require-owner";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = requireOwnerSession();
  if (error) return error;

  const service = await prisma.service.findUnique({ where: { id: params.id } });
  if (!service || service.salonId !== session!.salonId) {
    return NextResponse.json({ ok: false, error: "Service not found" }, { status: 404 });
  }

  const body = await req.json();
  const updated = await prisma.service.update({
    where: { id: params.id },
    data: {
      name: body.name ?? service.name,
      priceNaira: body.priceNaira ?? service.priceNaira,
      durationMin: body.durationMin ?? service.durationMin,
    },
  });
  return NextResponse.json({ ok: true, service: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { session, error } = requireOwnerSession();
  if (error) return error;

  const service = await prisma.service.findUnique({ where: { id: params.id } });
  if (!service || service.salonId !== session!.salonId) {
    return NextResponse.json({ ok: false, error: "Service not found" }, { status: 404 });
  }

  await prisma.service.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

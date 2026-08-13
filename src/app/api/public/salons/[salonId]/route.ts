import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public, unauthenticated — this is what the WhatsApp booking link opens.
// Deliberately returns no phone numbers or financial data, only what a
// customer needs to pick a service/staff/time.
export async function GET(_req: Request, { params }: { params: { salonId: string } }) {
  const salon = await prisma.salon.findUnique({
    where: { id: params.salonId },
    select: {
      id: true,
      name: true,
      city: true,
      services: { select: { id: true, name: true, priceNaira: true, durationMin: true } },
      staff: { where: { role: { in: ["OWNER", "STYLIST"] } }, select: { id: true, name: true } },
    },
  });

  if (!salon) {
    return NextResponse.json({ ok: false, error: "Salon not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, salon });
}

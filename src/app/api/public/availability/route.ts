import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateDaySlotStarts, isSlotAvailable } from "@/lib/scheduling";

// Public — computes open slots for a given staff/service/day so the
// customer-facing booking page only ever shows times that are actually free.
export async function GET(req: NextRequest) {
  const staffId = req.nextUrl.searchParams.get("staffId");
  const serviceId = req.nextUrl.searchParams.get("serviceId");
  const dateParam = req.nextUrl.searchParams.get("date");

  if (!staffId || !serviceId || !dateParam) {
    return NextResponse.json(
      { ok: false, error: "staffId, serviceId, and date are required" },
      { status: 400 }
    );
  }

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) {
    return NextResponse.json({ ok: false, error: "Service not found" }, { status: 404 });
  }

  const date = new Date(dateParam);
  const candidates = generateDaySlotStarts(date);

  const availability = await Promise.all(
    candidates.map(async (slot) => ({
      startTime: slot.toISOString(),
      available: await isSlotAvailable({ staffId, startTime: slot, durationMin: service.durationMin }),
    }))
  );

  return NextResponse.json({
    ok: true,
    slots: availability.filter((s) => s.available).map((s) => s.startTime),
  });
}

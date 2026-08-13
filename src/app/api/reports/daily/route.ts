import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// The daily reconciliation summary from PRD 5.2: total booked vs.
// collected, by method, with flagged (under-collected) entries surfaced.
export async function GET(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });

  const dateParam = req.nextUrl.searchParams.get("date");
  const date = dateParam ? new Date(dateParam) : new Date();
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const appointments = await prisma.appointment.findMany({
    where: { salonId: session.salonId, startTime: { gte: dayStart, lt: dayEnd } },
    include: { service: true, staff: true, customer: true, transaction: true },
  });

  const completed = appointments.filter((a) => a.status === "COMPLETED" && a.transaction);
  const noShowCount = appointments.filter((a) => a.status === "NO_SHOW").length;

  const totalBooked = completed.reduce((sum, a) => sum + Number(a.service.priceNaira), 0);
  const totalCollected = completed.reduce((sum, a) => sum + Number(a.transaction!.amountNaira), 0);

  const byMethod: Record<string, number> = {};
  for (const a of completed) {
    const method = a.transaction!.method;
    byMethod[method] = (byMethod[method] ?? 0) + Number(a.transaction!.amountNaira);
  }

  const flagged = completed
    .filter((a) => a.transaction!.isFlagged)
    .map((a) => ({
      appointmentId: a.id,
      customer: a.customer.name || a.customer.phone,
      staff: a.staff.name,
      service: a.service.name,
      expected: Number(a.service.priceNaira),
      collected: Number(a.transaction!.amountNaira),
    }));

  return NextResponse.json({
    ok: true,
    summary: {
      totalAppointments: appointments.length,
      completedCount: completed.length,
      noShowCount,
      totalBooked,
      totalCollected,
      byMethod,
      flagged,
    },
  });
}

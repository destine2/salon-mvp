import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { requireOwnerSession } from "@/lib/require-owner";
import { formatClock, parseClock } from "@/lib/lagos-time";

// Opening hours are salon-wide (PRD keeps per-staff schedules out of MVP).
// All times are Lagos wall clock — see src/lib/lagos-time.ts.

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });

  const hours = await prisma.businessHours.findMany({
    where: { salonId: session.salonId },
    orderBy: { weekday: "asc" },
  });

  return NextResponse.json({
    ok: true,
    hours: hours.map((h) => ({
      weekday: h.weekday,
      opens: formatClock(h.opensMin),
      closes: formatClock(h.closesMin),
    })),
  });
}

/**
 * Replaces the whole week in one call.
 *
 * Whole-week replacement rather than per-day edits is deliberate: closing a day
 * means *removing* its row, and a PATCH-per-day API makes "delete Sunday"
 * awkward to express. The client sends the days it is open; everything else is
 * closed.
 */
export async function PUT(req: NextRequest) {
  // Narrowed in two steps rather than `if (error || !session) return error`:
  // that version can return null, which is not a valid route handler result
  // and fails Next's generated route type check (though not plain tsc).
  const { session, error } = requireOwnerSession();
  if (error) return error;
  if (!session) {
    return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json();
  const days = body?.hours;
  if (!Array.isArray(days)) {
    return NextResponse.json(
      { ok: false, error: "hours must be an array of { weekday, opens, closes }" },
      { status: 400 }
    );
  }

  const parsed: { weekday: number; opensMin: number; closesMin: number }[] = [];
  const seen = new Set<number>();

  for (const day of days) {
    const weekday = Number(day?.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return NextResponse.json(
        { ok: false, error: `weekday must be 0-6, got ${day?.weekday}` },
        { status: 400 }
      );
    }
    if (seen.has(weekday)) {
      return NextResponse.json(
        { ok: false, error: `weekday ${weekday} appears more than once` },
        { status: 400 }
      );
    }
    seen.add(weekday);

    let opensMin: number;
    let closesMin: number;
    try {
      opensMin = parseClock(String(day.opens));
      closesMin = parseClock(String(day.closes));
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "Invalid time" },
        { status: 400 }
      );
    }

    if (closesMin <= opensMin) {
      return NextResponse.json(
        { ok: false, error: `Closing time must be after opening time on weekday ${weekday}` },
        { status: 400 }
      );
    }

    parsed.push({ weekday, opensMin, closesMin });
  }

  // One transaction so a failure cannot leave the salon with no hours at all,
  // which would read as "closed every day" to the booking page.
  await prisma.$transaction([
    prisma.businessHours.deleteMany({ where: { salonId: session.salonId } }),
    prisma.businessHours.createMany({
      data: parsed.map((p) => ({ ...p, salonId: session.salonId })),
    }),
  ]);

  return NextResponse.json({ ok: true, count: parsed.length });
}

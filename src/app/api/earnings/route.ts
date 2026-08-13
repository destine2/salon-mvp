import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// A staff member's own running total — reduces the commission disputes the
// market research flagged (PRD 5.3): "As staff, I can see my own running
// total for the day/week."
export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);

  const splits = await prisma.transactionSplit.findMany({
    where: {
      staffId: session.staffId,
      recipient: "STAFF",
      transaction: { createdAt: { gte: weekStart } },
    },
    include: {
      transaction: {
        include: { appointment: { include: { service: true, customer: true } } },
      },
    },
    orderBy: { id: "desc" },
  });

  let todayTotal = 0;
  let weekTotal = 0;
  const recent = [];

  for (const split of splits) {
    const amount = Number(split.amountNaira);
    weekTotal += amount;
    if (split.transaction.createdAt >= todayStart) todayTotal += amount;

    recent.push({
      id: split.id,
      amount,
      service: split.transaction.appointment.service.name,
      customer: split.transaction.appointment.customer.name || split.transaction.appointment.customer.phone,
      date: split.transaction.createdAt,
    });
  }

  return NextResponse.json({
    ok: true,
    todayTotal,
    weekTotal,
    recent: recent.slice(0, 15),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { sendDueReminders } from "@/lib/reminders";

// Triggered by Vercel Cron (see vercel.json) roughly every 15 minutes.
// Protected by a shared secret rather than a session — this isn't hit by a
// logged-in user, it's hit by the platform's scheduler.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendDueReminders();
  return NextResponse.json({ ok: true, ...result });
}

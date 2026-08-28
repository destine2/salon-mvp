import { NextRequest, NextResponse } from "next/server";
import { releaseExpiredHolds } from "@/lib/hold-sweep";

// Triggered every 5 minutes by a GitHub Actions workflow
// (.github/workflows/release-expired-holds.yml), same pattern as
// /api/cron/send-reminders. Protected by the same shared secret — this
// isn't hit by a logged-in user, it's hit by the scheduled workflow.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await releaseExpiredHolds();
  return NextResponse.json({ ok: true, ...result });
}

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import type { SessionPayload } from "@/lib/session";

/**
 * Guard for API routes that only the salon owner should be able to call
 * (adding/editing staff, services, commission rules). Any logged-in staff
 * can still hit the matching GET/list endpoints — this only gates writes.
 */
export function requireOwnerSession(): { session: SessionPayload | null; error: NextResponse | null } {
  const session = getSession();
  if (!session) {
    return { session: null, error: NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 }) };
  }
  if (session.role !== "OWNER") {
    return {
      session: null,
      error: NextResponse.json({ ok: false, error: "Only the salon owner can do this" }, { status: 403 }),
    };
  }
  return { session, error: null };
}

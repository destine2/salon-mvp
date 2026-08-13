import { cookies } from "next/headers";
import { verifySessionToken, type SessionPayload } from "@/lib/session";

export const SESSION_COOKIE = "salon_session";

/** Server-side helper — read and verify the session cookie in a Server Component or Route Handler. */
export function getSession(): SessionPayload | null {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

import { createHmac } from "crypto";

const SECRET = process.env.AUTH_SECRET ?? "";

function base64url(input: string) {
  return Buffer.from(input).toString("base64url");
}

function base64urlDecode(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

export type SessionPayload = {
  staffId: string;
  salonId: string;
  role: string;
  iat: number;
};

/**
 * Minimal signed-cookie session — no external JWT library needed for MVP.
 * Payload is base64url JSON plus an HMAC-SHA256 signature; both must match
 * for the token to be accepted. Swap for a proper JWT lib later if
 * requirements grow (token revocation, short-lived access + refresh pairs).
 */
export function createSessionToken(payload: Omit<SessionPayload, "iat">): string {
  if (!SECRET) throw new Error("AUTH_SECRET is not set");
  const full: SessionPayload = { ...payload, iat: Date.now() };
  const body = base64url(JSON.stringify(full));
  const signature = createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token || !SECRET) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", SECRET).update(body).digest("base64url");
  if (expected !== signature) return null;
  try {
    return JSON.parse(base64urlDecode(body)) as SessionPayload;
  } catch {
    return null;
  }
}

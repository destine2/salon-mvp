import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LENGTH = 64;

/**
 * scrypt rather than a bcrypt/argon2 dependency — same reasoning as the
 * signed-cookie session in lib/session.ts: node:crypto covers this without
 * adding a package for an MVP at pilot scale.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, KEY_LENGTH);
  const expected = Buffer.from(hash, "hex");
  // timingSafeEqual throws on length mismatch rather than returning false,
  // so a candidate of the wrong length has to be rejected before the call.
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

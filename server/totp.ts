// Time-based one-time passwords (CC-200), built on node:crypto only.
//   HOTP: RFC 4226 (HMAC, dynamic truncation)
//   TOTP: RFC 6238 (HOTP over 30-second steps since the Unix epoch)
// Circle Care uses HMAC-SHA1, 6 digits and a 30-second step — what every
// authenticator app supports — and accepts one step either side for clock drift.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const STEP_SECONDS = 30;
export const DIGITS = 6;
/** Steps accepted either side of now (±30 s) for clock drift. */
export const WINDOW = 1;

/* ---------------- Base32 (RFC 4648, no padding) ---------------- */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Accepts lower case, spaces and padding, as people type keys from a screen. Throws on other characters. */
export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("Not a base32 key");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/* ---------------- HOTP / TOTP ---------------- */

export type Algorithm = "sha1" | "sha256" | "sha512";

export function hotp(key: Buffer, counter: number | bigint, digits = DIGITS, algorithm: Algorithm = "sha1"): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac(algorithm, key).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const counterAt = (timeMs: number, step = STEP_SECONDS) => Math.floor(timeMs / 1000 / step);

export function totp(key: Buffer, timeMs: number, opts: { digits?: number; step?: number; algorithm?: Algorithm } = {}): string {
  return hotp(key, counterAt(timeMs, opts.step), opts.digits ?? DIGITS, opts.algorithm ?? "sha1");
}

/**
 * Checks a 6-digit code against now ± WINDOW steps. Returns the matching step
 * (so the caller can refuse a replay of the same or an older step) or null.
 * Every candidate is compared in constant time, and all of them are checked.
 */
export function verifyTotp(key: Buffer, code: string, timeMs: number): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const given = Buffer.from(c);
  const now = counterAt(timeMs);
  let match: number | null = null;
  for (let w = -WINDOW; w <= WINDOW; w++) {
    const expected = Buffer.from(hotp(key, now + w));
    if (timingSafeEqual(expected, given) && match === null) match = now + w;
  }
  return match;
}

/* ---------------- Enrolment helpers ---------------- */

/** A new 160-bit secret, as RFC 4226 recommends, in base32 for authenticator apps. */
export const newSecret = () => base32Encode(randomBytes(20));

/** The otpauth:// link authenticator apps read (shown as text and as a link; no QR library is added). */
export function otpauthUri(secret: string, account: string, issuer = "Circle Care"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const q = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${q.toString()}`;
}

/* ---------------- Recovery codes ---------------- */

export const RECOVERY_CODES = 10;

/** Ten one-time codes like "k7m2q-x9pfd" (50 random bits each). */
export function newRecoveryCodes(n = RECOVERY_CODES): string[] {
  return Array.from({ length: n }, () => {
    const s = base32Encode(randomBytes(7)).slice(0, 10).toLowerCase();
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

/** Lower case, letters and digits only, so "K7M2Q X9PFD" matches "k7m2q-x9pfd". */
export const normaliseRecoveryCode = (s: string) => s.toLowerCase().replace(/[^a-z2-7]/g, "");

/** Keyed hash for storage: a database copy alone can't be used to test guesses. */
export const hashRecoveryCode = (hmacKey: Buffer, code: string) => "rc1." + createHmac("sha256", hmacKey).update("mfa-recovery:" + normaliseRecoveryCode(code)).digest("hex");

// Field-level encryption, fingerprints, password hashing and tokens
// (CC-173, CC-174, CC-180, CC-181).

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import type { Config } from "./config";

const scrypt = (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number }) =>
  new Promise<Buffer>((res, rej) => scryptCb(pw, salt, len, { ...opts, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));

const b64u = (b: Buffer) => b.toString("base64url");
const unb64u = (s: string) => Buffer.from(s, "base64url");

/**
 * AES-256-GCM. Output: "v1.<keyId>.<iv>.<tag>.<ciphertext>" (base64url parts).
 * The key id lets us rotate keys: new data uses the current key, older data
 * still decrypts with the previous one.
 */
export function encrypt(cfg: Pick<Config, "keys" | "currentKeyId">, data: string | Buffer): string {
  const key = cfg.keys[cfg.currentKeyId];
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(typeof data === "string" ? Buffer.from(data, "utf8") : data), c.final()]);
  return ["v1", cfg.currentKeyId, b64u(iv), b64u(c.getAuthTag()), b64u(ct)].join(".");
}

/** Throws if the key is unknown or the ciphertext was altered — never returns partial output. */
export function decrypt(cfg: Pick<Config, "keys">, token: string): Buffer {
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") throw new Error("Unrecognised ciphertext format");
  const key = cfg.keys[parts[1]];
  if (!key) throw new Error("Unknown encryption key id");
  const d = createDecipheriv("aes-256-gcm", key, unb64u(parts[2]));
  d.setAuthTag(unb64u(parts[3]));
  return Buffer.concat([d.update(unb64u(parts[4])), d.final()]);
}

/** Keyed fingerprint for duplicate detection without decrypting. */
export const fingerprint = (cfg: Pick<Config, "hmacKey">, value: string) => "h1." + createHmac("sha256", cfg.hmacKey).update(value).digest("hex");

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => b64u(randomBytes(bytes));

/* ---------- Passwords: scrypt, per-user salt, constant-time compare ---------- */

const SCRYPT = { N: 16384, r: 8, p: 1 };

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw.normalize("NFKC"), salt, 64, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, b64u(salt), b64u(key)].join("$");
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, N, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt") return false;
  const expected = unb64u(hash);
  const key = await scrypt(pw.normalize("NFKC"), unb64u(salt), expected.length, { N: +N, r: +r, p: +p });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A real hash to compare against when the email is unknown, so timing doesn't reveal which accounts exist. */
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword(randomToken()));

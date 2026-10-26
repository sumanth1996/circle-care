// Environment configuration (CC-183, CC-190).
//
// APP_ENV decides how strict the server is. Anything other than "production"
// is a lower environment: only test SSNs, bank accounts and cards are
// accepted there (CC-182), so real sensitive data can never land in it.
// If APP_ENV is missing we assume development — the safe default.

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type AppEnv = "development" | "test" | "staging" | "production";

export interface Config {
  env: AppEnv;
  isProd: boolean;
  /** True everywhere except production: only test values are accepted. */
  testData: boolean;
  port: number;
  databaseUrl?: string;
  /** Folder for the embedded development database and generated dev keys. */
  dataDir: string;
  /** Encryption keys by id; `currentKeyId` encrypts, all ids can decrypt (rotation). */
  keys: Record<string, Buffer>;
  currentKeyId: string;
  /** Separate key for SSN fingerprints (duplicate detection without decrypting). */
  hmacKey: Buffer;
  paymentProvider: "simulated" | "stripe";
  stripeSecretKey?: string;
  sessionIdleMinutes: number;
  sessionAbsoluteHours: number;
  /** ACH transfers carry no platform fee. */
  achFeeCents: 0;
}

export class ConfigError extends Error {}

const ENVS: AppEnv[] = ["development", "test", "staging", "production"];

function key32(name: string, raw: string | undefined): Buffer | undefined {
  if (!raw) return undefined;
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new ConfigError(`${name} must be 32 bytes, base64-encoded (generate one with: openssl rand -base64 32).`);
  return buf;
}

/** Development keys are generated once and kept in .data/ (git-ignored). Test runs get fresh in-memory keys. */
function devKeys(env: AppEnv, dataDir: string): { enc: Buffer; hmac: Buffer } {
  if (env === "test") return { enc: randomBytes(32), hmac: randomBytes(32) };
  const file = join(dataDir, "dev-keys.json");
  if (existsSync(file)) {
    const j = JSON.parse(readFileSync(file, "utf8"));
    return { enc: Buffer.from(j.enc, "base64"), hmac: Buffer.from(j.hmac, "base64") };
  }
  mkdirSync(dataDir, { recursive: true });
  const k = { enc: randomBytes(32), hmac: randomBytes(32) };
  writeFileSync(file, JSON.stringify({ note: "Development-only keys. Never used in production.", enc: k.enc.toString("base64"), hmac: k.hmac.toString("base64") }), { mode: 0o600 });
  return k;
}

export function loadConfig(e: NodeJS.ProcessEnv = process.env): Config {
  const rawEnv = (e.APP_ENV || (e.NODE_ENV === "test" ? "test" : "development")).toLowerCase();
  if (!ENVS.includes(rawEnv as AppEnv)) throw new ConfigError(`APP_ENV must be one of ${ENVS.join(", ")}.`);
  const env = rawEnv as AppEnv;
  const isProd = env === "production";
  const dataDir = e.DATA_DIR || join(process.cwd(), ".data");

  let enc = key32("DATA_ENCRYPTION_KEY", e.DATA_ENCRYPTION_KEY);
  let hmac = key32("DATA_HMAC_KEY", e.DATA_HMAC_KEY);
  const problems: string[] = [];

  if (isProd) {
    if (!enc) problems.push("DATA_ENCRYPTION_KEY is required in production (32 bytes, base64, from your key manager).");
    if (!hmac) problems.push("DATA_HMAC_KEY is required in production (32 bytes, base64, different from the encryption key).");
    if (enc && hmac && enc.equals(hmac)) problems.push("DATA_HMAC_KEY must be different from DATA_ENCRYPTION_KEY.");
    if (!e.DATABASE_URL) problems.push("DATABASE_URL is required in production; the embedded database is for development only.");
    if (e.PAYMENT_PROVIDER !== "stripe") problems.push('PAYMENT_PROVIDER must be "stripe" in production; the simulated vault is never available there.');
    if (e.PAYMENT_PROVIDER === "stripe" && !/^sk_live_/.test(e.STRIPE_SECRET_KEY ?? "")) problems.push("STRIPE_SECRET_KEY (a live secret key) is required in production.");
  } else if (env === "staging" && (!enc || !hmac)) {
    // Staging keeps data across restarts (e.g. Replit PostgreSQL), so its keys must be stable too.
    problems.push("DATA_ENCRYPTION_KEY and DATA_HMAC_KEY are required in staging (add them as secrets; generate each with: openssl rand -base64 32).");
  } else if (e.PAYMENT_PROVIDER === "stripe" && /^sk_live_/.test(e.STRIPE_SECRET_KEY ?? "")) {
    problems.push("A live Stripe key can't be used outside production. Use a test key (sk_test_…).");
  }
  if (problems.length) throw new ConfigError(`Circle Care will not start:\n - ${problems.join("\n - ")}`);

  if (!enc || !hmac) {
    const d = devKeys(env, dataDir);
    enc ??= d.enc;
    hmac ??= d.hmac;
  }

  const currentKeyId = e.DATA_ENCRYPTION_KEY_ID || "k1";
  const keys: Record<string, Buffer> = { [currentKeyId]: enc };
  const prev = key32("DATA_ENCRYPTION_KEY_PREVIOUS", e.DATA_ENCRYPTION_KEY_PREVIOUS);
  if (prev) keys[e.DATA_ENCRYPTION_KEY_PREVIOUS_ID || "k0"] = prev;

  return {
    env,
    isProd,
    testData: !isProd,
    port: Number(e.PORT) || 5000,
    databaseUrl: e.DATABASE_URL || undefined,
    dataDir,
    keys,
    currentKeyId,
    hmacKey: hmac,
    paymentProvider: e.PAYMENT_PROVIDER === "stripe" ? "stripe" : "simulated",
    stripeSecretKey: e.STRIPE_SECRET_KEY,
    sessionIdleMinutes: 30,
    sessionAbsoluteHours: 12,
    achFeeCents: 0,
  };
}

// Masked audit export for FDIC examinations and legal requests (CC-184).
//
//   npm run audit:export -- --out ./audit-export [--full-names] [--operator "Jane Doe"]
//
// Reads only the masked views and the masked audit trail. Writes
// people.csv, payment_methods.csv, audit_events.csv and manifest.json
// (row counts and a SHA-256 of every file so the package can be verified).

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { audit, LOOKS_SENSITIVE } from "../audit";
import { loadConfig, type Config } from "../config";
import { openDb, type Db } from "../db";
import { migrate } from "../migrate";

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: Record<string, unknown>[], cols: string[]) => [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";

export interface ExportResult { dir: string; files: Record<string, { rows: number; sha256: string }> }

export async function runAuditExport(db: Db, cfg: Config, opts: { out: string; fullNames?: boolean; operator?: string; now?: Date }): Promise<ExportResult> {
  const now = opts.now ?? new Date();
  const dir = resolve(opts.out);
  mkdirSync(dir, { recursive: true });

  const nameCol = opts.fullNames
    ? "(SELECT first_name || ' ' || last_name FROM (SELECT user_id, first_name, last_name FROM elders UNION ALL SELECT user_id, first_name, last_name FROM caregivers UNION ALL SELECT user_id, first_name, last_name FROM guardians) n WHERE n.user_id = v.user_id) AS name"
    : "v.name_masked AS name";
  const people = (await db.query(`SELECT v.user_id, v.role, ${nameCol}, v.email_masked, v.phone_masked, v.ssn_masked, v.created_at FROM audit_people_masked v ORDER BY v.created_at`)).rows;
  const methods = (await db.query("SELECT user_id, kind, label, detail, number_masked, routing_masked, is_primary, fee_cents, created_at FROM audit_payment_methods_masked ORDER BY created_at")).rows;
  const events = (await db.query("SELECT id, at, actor_user_id, subject_user_id, action, detail FROM audit_events ORDER BY id")).rows;

  const files: Record<string, string> = {
    "people.csv": toCsv(people, ["user_id", "role", "name", "email_masked", "phone_masked", "ssn_masked", "created_at"]),
    "payment_methods.csv": toCsv(methods, ["user_id", "kind", "label", "detail", "number_masked", "routing_masked", "is_primary", "fee_cents", "created_at"]),
    "audit_events.csv": toCsv(events, ["id", "at", "actor_user_id", "subject_user_id", "action", "detail"]),
  };

  // Last line of defence: refuse to write a file that contains anything that looks like a full number.
  for (const [name, body] of Object.entries(files)) {
    const scrubbed = body.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>").replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<time>");
    if (LOOKS_SENSITIVE.test(scrubbed)) throw new Error(`Refusing to write ${name}: it contains an unmasked number.`);
  }

  const out: ExportResult["files"] = {};
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body, { mode: 0o600 });
    out[name] = { rows: body.trimEnd().split("\n").length - 1, sha256: createHash("sha256").update(body).digest("hex") };
  }
  const manifest = {
    generatedAt: now.toISOString(),
    environment: cfg.env,
    operator: opts.operator ?? process.env.USER ?? "unknown",
    masking: {
      ssn: "•••-••-last4", bankAccount: "••••last4", routingNumber: "•••••last4", card: "brand + •••• last4",
      email: "first letter + ••• + @domain", phone: "(•••) •••-last4", names: opts.fullNames ? "full (legal hold)" : "first name + last initial",
    },
    files: out,
  };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  await audit(db, { action: "audit.exported", detail: { operator: manifest.operator, fullNames: !!opts.fullNames, files: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { rows: v.rows, sha256: v.sha256 }])) }, at: now });
  return { dir, files: out };
}

const isMain = process.argv[1] && /audit-export\.(ts|js)$/.test(process.argv[1]);
if (isMain) {
  const args = process.argv.slice(2);
  const get = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  (async () => {
    const cfg = loadConfig();
    const db = await openDb(cfg);
    await migrate(db);
    const r = await runAuditExport(db, cfg, { out: get("--out") ?? "audit-export", fullNames: args.includes("--full-names"), operator: get("--operator") });
    console.log(`Masked audit export written to ${r.dir}`);
    for (const [k, v] of Object.entries(r.files)) console.log(`  ${k}: ${v.rows} rows, sha256 ${v.sha256}`);
    await db.close();
  })().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}

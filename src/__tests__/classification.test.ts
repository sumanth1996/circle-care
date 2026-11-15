// CC-9: every state field and every table column has a data class, and the
// data inventory lists the same fields as src/data/classification.ts.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLASS_LABEL, DB_CLASSIFICATION, STATE_CLASSIFICATION, type DataClass } from "../data/classification";
import { MATRIX } from "../data/policy";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/* ---------- Reading the sources ---------- */

/** Text between the bracket at `open` and its partner. */
function inside(src: string, open: number, o = "{", c = "}"): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === o) depth++;
    else if (src[i] === c && --depth === 0) return src.slice(open + 1, i);
  }
  throw new Error(`Unclosed ${o} at ${open}`);
}

/** Split at top level (outside the given brackets) on any of `seps`. */
function splitTop(body: string, seps: string, open = "{[(<", close = "}])>"): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of body) {
    if (open.includes(ch)) depth++;
    else if (close.includes(ch)) depth--;
    if (depth === 0 && seps.includes(ch)) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * Field paths of every exported interface. A field whose type is an inline
 * object is listed by its inner fields ("pill.color"). A field whose type is
 * another exported interface (or a list of them) is left to that interface.
 */
export function interfaceFields(ts: string): Record<string, string[]> {
  const src = ts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const names = [...src.matchAll(/export interface (\w+)\s*\{/g)].map((m) => m[1]);
  const known = new Set(names);
  const walk = (body: string, prefix: string): string[] =>
    splitTop(body, ";\n").flatMap((member) => {
      const m = member.match(/^(\w+)\??\s*:\s*([\s\S]+)$/);
      if (!m) throw new Error(`Can't read the member "${member}"`);
      const [, name, type] = m;
      const t = type.trim();
      if (t.startsWith("{")) {
        const inner = inside(t, 0);
        if (/^\{[\s\S]*\}(\[\])?$/.test(t) && t.length - inner.length <= 4) return walk(inner, `${prefix}${name}.`);
      }
      const bare = t.replace(/\[\]$/, "").replace(/\s*\|\s*null$/, "");
      return known.has(bare) ? [] : [prefix + name];
    });
  const out: Record<string, string[]> = {};
  for (const m of src.matchAll(/export interface (\w+)\s*\{/g)) out[m[1]] = walk(inside(src, m.index! + m[0].length - 1), "");
  return out;
}

const SQL_CONSTRAINT = /^(PRIMARY KEY|UNIQUE|CHECK|FOREIGN KEY|CONSTRAINT|EXCLUDE)\b/i;

/** Columns of every table created or altered in the given SQL. */
export function tableColumns(sql: string): Record<string, string[]> {
  const src = sql.replace(/--.*$/gm, "");
  const out: Record<string, string[]> = {};
  for (const m of src.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)\s*\(/gi)) {
    const cols = splitTop(inside(src, m.index! + m[0].length - 1, "(", ")"), ",", "(", ")")
      .filter((c) => !SQL_CONSTRAINT.test(c))
      .map((c) => c.split(/\s+/)[0]);
    out[m[1]] = [...(out[m[1]] ?? []), ...cols];
  }
  for (const m of src.matchAll(/ALTER TABLE (?:ONLY )?(\w+)\s+ADD COLUMN (?:IF NOT EXISTS )?(\w+)/gi)) out[m[1]] = [...(out[m[1]] ?? []), m[2]];
  return out;
}

/** What is missing from, or stale in, a classification. */
export function gaps(found: Record<string, string[]>, classified: Record<string, Record<string, DataClass>>, what: string) {
  const problems: string[] = [];
  for (const [entity, fields] of Object.entries(found)) {
    const c = classified[entity];
    if (!c) { problems.push(`${what} ${entity} has no classification`); continue; }
    for (const f of fields) if (!(f in c)) problems.push(`${entity}.${f} has no data class`);
    for (const f of Object.keys(c)) if (!fields.includes(f)) problems.push(`${entity}.${f} is classified but no longer exists`);
  }
  for (const entity of Object.keys(classified)) if (!(entity in found)) problems.push(`${what} ${entity} is classified but no longer exists`);
  return problems;
}

const stateFields = () => interfaceFields(read("src/data/types.ts"));
const migrationsSql = () => {
  const dir = join(ROOT, "server", "migrations");
  return readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
};
const dbColumns = () => tableColumns(migrationsSql() + "\n" + read("server/migrate.ts"));
const stateFieldsOnly = Object.fromEntries(Object.entries(STATE_CLASSIFICATION).map(([k, v]) => [k, v.fields]));

/* ---------- The checks ---------- */

describe("data classification (CC-9)", () => {
  it("tags every field of the demo state", () => {
    expect(gaps(stateFields(), stateFieldsOnly, "Interface")).toEqual([]);
  });

  it("tags every column of every Postgres table", () => {
    expect(gaps(dbColumns(), DB_CLASSIFICATION, "Table")).toEqual([]);
  });

  it("covers the 11 tables of the schema plus the migrations log", () => {
    expect(Object.keys(dbColumns()).sort()).toEqual([
      "audit_events", "bank_accounts", "caregivers", "elders", "guardians", "payment_cards",
      "photos", "schema_migrations", "sessions", "ssn_fingerprints", "users", "vault_tokens",
    ]);
  });

  it("guards each state entity with a resource from the permission matrix", () => {
    for (const [entity, c] of Object.entries(STATE_CLASSIFICATION)) {
      for (const r of c.resource === null ? [] : Array.isArray(c.resource) ? c.resource : [c.resource]) {
        expect(MATRIX[r], `${entity} names ${r}`).toBeDefined();
      }
    }
  });

  it("keeps SSNs, bank details, cards and credentials in the sensitive class", () => {
    for (const t of ["elders", "caregivers", "guardians"]) {
      expect(DB_CLASSIFICATION[t].ssn_enc).toBe("Sensitive");
      expect(DB_CLASSIFICATION[t].ssn_last4).toBe("Sensitive");
    }
    expect(DB_CLASSIFICATION.ssn_fingerprints.fingerprint).toBe("Sensitive");
    expect(DB_CLASSIFICATION.users.password_hash).toBe("Sensitive");
    for (const c of ["vault_token", "account_last4", "routing_last4", "bank_name"]) expect(DB_CLASSIFICATION.bank_accounts[c]).toBe("Sensitive");
    for (const c of ["vault_token", "last4", "brand", "exp_month", "exp_year"]) expect(DB_CLASSIFICATION.payment_cards[c]).toBe("Sensitive");
  });

  it("treats free text that can carry health details as PHI", () => {
    const f = (e: string, k: string) => STATE_CLASSIFICATION[e].fields[k];
    expect(f("ChatMessage", "text")).toBe("PHI");
    expect(f("CareNote", "text")).toBe("PHI");
    expect(f("DoseLog", "reason")).toBe("PHI");
    expect(f("Handoff", "notes")).toBe("PHI");
    expect(f("Alert", "detail")).toBe("PHI");
    expect(f("Alert", "title")).toBe("Operational");
  });
});

describe("classification check itself", () => {
  it("names a new state field that has no class", () => {
    const ts = `export interface Member {\n  id: string;\n  /** new */\n  nickname?: string;\n}`;
    expect(gaps(interfaceFields(ts), { Member: { id: "Operational" } }, "Interface")).toEqual(["Member.nickname has no data class"]);
  });

  it("names a new column, including one added by ALTER TABLE", () => {
    const sql = "CREATE TABLE users (\n  id uuid PRIMARY KEY, -- key\n  email text NOT NULL CHECK (email = lower(email)),\n  UNIQUE (email)\n);\nALTER TABLE users ADD COLUMN mfa_secret text;";
    expect(gaps(tableColumns(sql), { users: { id: "Operational", email: "PII" } }, "Table")).toEqual(["users.mfa_secret has no data class"]);
  });

  it("reads inline objects as dotted fields and skips links to other interfaces", () => {
    const ts = "export interface A { x: number }\nexport interface B {\n  a: A[];\n  pill: { color: string; shape: \"round\" | \"oval\" };\n  deep: {\n    t: { lo: number; hi: number };\n    on: boolean;\n  };\n  map: Record<string, { at: string }>;\n}";
    expect(interfaceFields(ts).B).toEqual(["pill.color", "pill.shape", "deep.t.lo", "deep.t.hi", "deep.on", "map"]);
  });

  it("names a classified field that was removed", () => {
    expect(gaps({ Member: ["id"] }, { Member: { id: "Operational", name: "PII" } }, "Interface")).toEqual(["Member.name is classified but no longer exists"]);
  });
});

/* ---------- The inventory document matches the code ---------- */

/** Rows of the inventory's field tables: | `Entity` | PHI | PII | Sensitive | Operational | notes | */
function inventoryRows(md: string) {
  const rows: Record<string, Record<DataClass, string[]>> = {};
  for (const line of md.split("\n")) {
    const m = line.match(/^\| `([\w]+)` \|(.*)\|\s*$/);
    if (!m) continue;
    const cells = m[2].split("|").map((c) => c.trim());
    if (cells.length < 5) continue;
    const list = (c: string) => (c === "—" || c === "" ? [] : [...c.matchAll(/`([^`]+)`/g)].map((x) => x[1]));
    rows[m[1]] = { PHI: list(cells[0]), PII: list(cells[1]), Sensitive: list(cells[2]), Operational: list(cells[3]) };
  }
  return rows;
}

describe("data inventory document (docs/compliance/09-data-inventory.md)", () => {
  const rows = inventoryRows(read("docs/compliance/09-data-inventory.md"));
  const all: [string, Record<string, DataClass>][] = [...Object.entries(stateFieldsOnly), ...Object.entries(DB_CLASSIFICATION)];

  it("has a row for every entity and table, listing the same fields in each class", () => {
    const problems: string[] = [];
    for (const [entity, fields] of all) {
      const row = rows[entity];
      if (!row) { problems.push(`The inventory has no row for ${entity}`); continue; }
      for (const cls of Object.keys(CLASS_LABEL) as DataClass[]) {
        const want = Object.entries(fields).filter(([, c]) => c === cls).map(([k]) => k).sort();
        const got = [...row[cls]].sort();
        if (want.join() !== got.join()) problems.push(`${entity} ${cls}: code has [${want.join(", ")}], inventory has [${got.join(", ")}]`);
      }
    }
    for (const entity of Object.keys(rows)) if (!all.some(([e]) => e === entity)) problems.push(`The inventory has a row for ${entity}, which the code doesn't classify`);
    expect(problems).toEqual([]);
  });
});

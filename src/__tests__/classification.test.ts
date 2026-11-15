// CC-9: every state field and every table column has a data class, and the
// data inventory lists the same fields as src/data/classification.ts.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLASS_LABEL, DB_CLASSIFICATION, STATE_CLASSIFICATION, type DataClass } from "../data/classification";
import { MATRIX } from "../data/policy";
import { loadConfig } from "../../server/config";
import { openDb } from "../../server/db";
import { migrate } from "../../server/migrate";

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

/** Split at top level (outside brackets) on any of `seps`. */
function splitTop(body: string, seps: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of body) {
    if ("{[(<".includes(ch)) depth++;
    else if ("}])>".includes(ch)) depth--;
    if (depth === 0 && seps.includes(ch)) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** `{…}` alone, with nothing outside the braces. */
const isObject = (t: string) => t.startsWith("{") && inside(t, 0).length + 2 === t.length;

/**
 * Field paths of every interface, and of every type alias for an object, in
 * a TypeScript source. A field whose type is an inline object is listed by its
 * inner fields ("pill.color"), through arrays, `Partial<…>` and
 * `Record<K, …>` ("map.*.at"). A field whose type is another declared
 * interface is left to that one, and so are fields inherited with `extends`.
 *
 * It refuses, rather than skips, anything it can't read: a declaration it
 * didn't parse, a member it can't split, or an inline object inside a union,
 * an intersection or another generic. A new shape then fails the test until
 * this reader learns it, instead of passing with fields left out.
 */
export function interfaceFields(ts: string): Record<string, string[]> {
  const src = ts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/"(?:[^"\\]|\\.)*"/g, '""');
  const decl = /\b(?:export\s+)?(?:declare\s+)?(interface|type)\s+(\w+)\s*(<)?/g;
  type Decl = { kind: string; name: string; body: string | null; parents: string[] };
  const decls: Decl[] = [];
  for (const m of src.matchAll(decl)) {
    let i = m.index! + m[0].length;
    for (let d = m[3] ? 1 : 0; d; i++) { if (src[i] === "<") d++; else if (src[i] === ">") d--; }
    if (m[1] === "interface") {
      const brace = src.indexOf("{", i);
      const head = src.slice(i, brace).trim();
      const ext = head.match(/^extends\s+([\s\S]+)$/);
      if (head && !ext) throw new Error(`Can't read the interface ${m[2]}: "${head}"`);
      const parents = ext ? splitTop(ext[1], ",").map((p) => p.replace(/<[\s\S]*>$/, "").trim()) : [];
      decls.push({ kind: "interface", name: m[2], body: inside(src, brace), parents });
    } else {
      const eq = src.slice(i).match(/^\s*=\s*/);
      if (!eq) throw new Error(`Can't read the type ${m[2]}`);
      const start = i + eq[0].length;
      let depth = 0, j = start;
      for (; j < src.length; j++) {
        const ch = src[j];
        if ("{[(<".includes(ch)) depth++;
        else if ("}])>".includes(ch)) depth--;
        else if (depth === 0 && (ch === ";" || (ch === "\n" && !/^\s*[|&]/.test(src.slice(j + 1))))) break;
      }
      const rhs = src.slice(start, j).trim().replace(/^[|&]\s*/, "");
      const parts = splitTop(rhs, "&");
      if (parts.length > 1 || isObject(rhs)) {
        const objects = parts.filter(isObject);
        if (objects.length + parts.filter((p) => /^\w+$/.test(p)).length !== parts.length) throw new Error(`Can't read the type ${m[2]}: "${rhs}"`);
        decls.push({ kind: "type", name: m[2], body: objects.map((o) => inside(o, 0)).join(";\n"), parents: parts.filter((p) => !isObject(p)) });
      } else if (rhs.includes("{")) {
        throw new Error(`Can't read the type ${m[2]}: an object inside "${rhs}"`);
      } else decls.push({ kind: "type", name: m[2], body: null, parents: [] });
    }
  }
  // Every "interface X" and "type X =" in the file must have been read above.
  const seen = (src.match(/\binterface\s+\w+/g) ?? []).length + (src.match(/\btype\s+\w+\s*(<[^=]*>)?\s*=/g) ?? []).length;
  if (seen !== decls.length) throw new Error(`Read ${decls.length} of ${seen} declarations`);
  const names = new Set<string>();
  for (const d of decls) { if (names.has(d.name)) throw new Error(`${d.name} is declared twice`); names.add(d.name); }
  const objects = new Set(decls.filter((d) => d.body !== null).map((d) => d.name));
  for (const d of decls) for (const p of d.parents) if (!objects.has(p)) throw new Error(`${d.name} extends ${p}, which isn't declared here`);

  const strip = (t: string): string => {
    let x = t.trim();
    while (x.startsWith("(") && inside(x, 0, "(", ")").length + 2 === x.length) x = x.slice(1, -1).trim();
    const parts = splitTop(x, "|").filter((p) => p !== "null" && p !== "undefined");
    return parts.length === 1 ? parts[0] : parts.join(" | ");
  };
  const walk = (body: string, prefix: string): string[] =>
    splitTop(body, ";\n").flatMap((member) => {
      const m = member.match(/^(?:readonly\s+)?(\w+)\??\s*:\s*([\s\S]+)$/);
      if (!m) throw new Error(`Can't read the member "${member}"`);
      const [, name, type] = m;
      let t = strip(type);
      let path = `${prefix}${name}`;
      for (;;) {
        const arr = t.match(/^([\s\S]+)\[\]$/) ?? t.match(/^(?:Array|ReadonlyArray|Partial|Required|Readonly)<([\s\S]+)>$/);
        if (arr) { t = strip(arr[1]); continue; }
        const rec = t.match(/^Record<([\s\S]+)>$/);
        if (rec) {
          const [, value] = splitTop(rec[1], ",");
          if (!value?.includes("{")) return [path];
          t = strip(value); path += ".*"; continue;
        }
        break;
      }
      if (isObject(t)) return walk(inside(t, 0), `${path}.`);
      if (t.includes("{")) throw new Error(`Can't read the member ${path}: an object inside "${t}"`);
      const refs = splitTop(t, "|").map((p) => p.replace(/<[\s\S]*>$/, ""));
      return refs.every((r) => objects.has(r)) ? [] : [path];
    });
  const out: Record<string, string[]> = {};
  for (const d of decls) if (d.body !== null) out[d.name] = walk(d.body, "");
  return out;
}

/** Columns of every table and view in the public schema, read from Postgres itself. */
export async function databaseColumns(extraSql = ""): Promise<Record<string, string[]>> {
  const db = await openDb(loadConfig({ APP_ENV: "test" }), { memory: true });
  try {
    await migrate(db);
    if (extraSql) await db.exec(extraSql);
    const { rows } = await db.query<{ t: string; c: string }>(
      "SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position");
    const out: Record<string, string[]> = {};
    for (const r of rows) (out[r.t] ??= []).push(r.c);
    return out;
  } finally {
    await db.close();
  }
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
const stateFieldsOnly = Object.fromEntries(Object.entries(STATE_CLASSIFICATION).map(([k, v]) => [k, v.fields]));
// A fresh in-memory Postgres per call: the first one pays PGlite's cold start (see config-and-export.test.ts).
const SLOW_DB = { timeout: 20_000 };

/** Member ids that aren't named `by`/`…By`. */
const MEMBER_REFS = ["caregiverId", "responderId", "escortId", "actorId", "assignee"];

/* ---------- The checks ---------- */

describe("data classification (CC-9)", () => {
  it("tags every field of the demo state", () => {
    expect(gaps(stateFields(), stateFieldsOnly, "Interface")).toEqual([]);
  });

  it("tags every column of every Postgres table and view", SLOW_DB, async () => {
    const cols = await databaseColumns();
    expect(Object.keys(cols)).toContain("schema_migrations");
    expect(gaps(cols, DB_CLASSIFICATION, "Table")).toEqual([]);
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
    expect(DB_CLASSIFICATION.sessions.token_hash).toBe("Sensitive");
    for (const c of ["vault_token", "account_last4", "routing_last4", "bank_name"]) expect(DB_CLASSIFICATION.bank_accounts[c]).toBe("Sensitive");
    for (const c of ["vault_token", "last4", "brand", "exp_month", "exp_year"]) expect(DB_CLASSIFICATION.payment_cards[c]).toBe("Sensitive");
    // The server audit log records SSN, bank and card last fours (account.ts, payments.ts).
    expect(DB_CLASSIFICATION.audit_events.detail).toBe("Sensitive");
    expect(DB_CLASSIFICATION.audit_people_masked.ssn_masked).toBe("Sensitive");
  });

  it("treats free text that can carry health details as PHI", () => {
    const f = (e: string, k: string) => STATE_CLASSIFICATION[e].fields[k];
    expect(f("ChatMessage", "text")).toBe("PHI");
    expect(f("CareNote", "text")).toBe("PHI");
    expect(f("DoseLog", "reason")).toBe("PHI");
    expect(f("Handoff", "notes")).toBe("PHI");
    expect(f("CareDoc", "rejectReason")).toBe("PHI");
    expect(f("Alert", "detail")).toBe("PHI");
    expect(f("Alert", "title")).toBe("Operational");
    // The access log names what was opened: medicines, documents, appointments (store.tsx).
    expect(f("AuditEvent", "resource")).toBe("PHI");
  });

  it("treats medicine ids, and keys built from them, as PHI", () => {
    const f = (e: string, k: string) => STATE_CLASSIFICATION[e].fields[k];
    expect(f("Medication", "id")).toBe("PHI");
    expect(f("DoseLog", "medId")).toBe("PHI");
    expect(f("Appointment", "medIds")).toBe("PHI");
    expect(f("Alert", "key")).toBe("PHI");
  });

  it("tags who and when as PHI in every record that holds PHI", () => {
    const problems: string[] = [];
    for (const [entity, { fields }] of Object.entries(STATE_CLASSIFICATION)) {
      const groups = new Map<string, [string, DataClass][]>();
      for (const [f, c] of Object.entries(fields)) {
        const g = f.includes(".") ? f.split(".")[0] : "";
        groups.set(g, [...(groups.get(g) ?? []), [f, c]]);
      }
      for (const list of groups.values()) {
        if (!list.some(([, c]) => c === "PHI")) continue;
        for (const [f, c] of list) {
          const leaf = f.split(".").pop()!;
          const whoOrWhen = /^(by|at)$|[a-z](By|At)$/.test(leaf) || MEMBER_REFS.includes(leaf);
          if (whoOrWhen && c !== "PHI") problems.push(`${entity}.${f} is ${c}, but it says who or when in a record that holds PHI`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("classification check itself", () => {
  it("names a new state field that has no class", () => {
    const ts = `export interface Member {\n  id: string;\n  /** new */\n  nickname?: string;\n}`;
    expect(gaps(interfaceFields(ts), { Member: { id: "Operational" } }, "Interface")).toEqual(["Member.nickname has no data class"]);
  });

  it("reads inline objects as dotted fields and skips links to other interfaces", () => {
    const ts = "export interface A { x: number }\nexport interface B {\n  a: A[];\n  b?: A | null;\n  pill: { color: string; shape: \"round\" | \"oval\" };\n  deep: {\n    t: { lo: number; hi: number } | null;\n    on: boolean;\n  };\n  list: Array<{ n: number }>;\n  some: Partial<{ p: string }>;\n  map: Record<string, { at: string }>;\n  flags: Record<string, boolean>;\n}";
    expect(interfaceFields(ts).B).toEqual(["pill.color", "pill.shape", "deep.t.lo", "deep.t.hi", "deep.on", "list.n", "some.p", "map.*.at", "flags"]);
  });

  it("reads interfaces that extend others, generic ones, unexported ones and object types", () => {
    const ts = "export interface A { x: number }\nexport interface B extends A { y: string }\ninterface C<T> { v: T; w: number }\nexport type D = { d: string };\nexport type E = A & { e: string };\nexport type Kind = \"a\" | \"b\";";
    const f = interfaceFields(ts);
    expect(f).toEqual({ A: ["x"], B: ["y"], C: ["v", "w"], D: ["d"], E: ["e"] });
  });

  it("refuses shapes it can't read instead of skipping them", () => {
    expect(() => interfaceFields("export interface A { u: { a: string } | { b: string } }")).toThrow(/an object inside/);
    expect(() => interfaceFields("export interface A { u: Map<string, { a: string }> }")).toThrow(/an object inside/);
    expect(() => interfaceFields("export interface A { [k: string]: number }")).toThrow(/Can't read the member/);
    expect(() => interfaceFields("export interface B extends Missing { y: string }")).toThrow(/isn't declared here/);
    expect(() => interfaceFields("export type U = { a: string } | { b: string };")).toThrow(/Can't read the type/);
  });

  it("names columns that the database has, however the SQL was written", SLOW_DB, async () => {
    const sql = [
      'CREATE UNLOGGED TABLE "Odd" (a int);',
      "CREATE TABLE\n  public.plain_two (b int);",
      "ALTER TABLE IF EXISTS users ADD mfa_secret text, ADD COLUMN mfa_backup text;",
      "ALTER TABLE sessions RENAME COLUMN user_id TO owner_id;",
      "CREATE TABLE copied AS SELECT 1 AS c;",
    ].join("\n");
    const cols = await databaseColumns(sql);
    const problems = gaps(cols, DB_CLASSIFICATION, "Table");
    expect(problems).toEqual(expect.arrayContaining([
      "Table Odd has no classification", "Table plain_two has no classification", "Table copied has no classification",
      "users.mfa_secret has no data class", "users.mfa_backup has no data class",
      "sessions.owner_id has no data class", "sessions.user_id is classified but no longer exists",
    ]));
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
    if (rows[m[1]]) throw new Error(`The inventory has two rows for ${m[1]}`);
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

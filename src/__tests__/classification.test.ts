// CC-9: every state field and every table column has a data class, and the
// data inventory lists the same fields as src/data/classification.ts.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLASS_LABEL, DB_CLASSIFICATION, STATE_CLASSIFICATION, type DataClass } from "../data/classification";
import { seed } from "../data/demo";
import { MATRIX } from "../data/policy";
import { evaluate } from "../data/store";
import { databaseColumns, dataFields, gaps, interfaceFields, unclassified } from "./classification-readers";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const LINKS = {
  "State.members": "Member", "State.meds": "Medication", "Medication.supply": "MedSupply", "State.doses": "DoseLog",
  "State.tasks": "CareTask", "State.taskLogs": "TaskLog", "State.shifts": "Shift", "State.visits": "Visit",
  "State.handoffs": "Handoff", "State.sos": "SosEvent", "State.checkins": "Checkin", "State.dailyLogs": "DailyLog",
  "State.chat": "Chat", "Chat.messages": "ChatMessage", "State.approvals": "Approval", "State.notes": "CareNote",
  "State.docs": "CareDoc", "State.appointments": "Appointment", "State.audit": "AuditEvent", "State.alerts": "Alert", "Alert.resolved": "AlertResolution", "State.reminders": "DoseReminder",
  "State.help": "HelpRequest", "HelpRequest.history": "HelpChange",
  "State.plans": "ComingHome", "ComingHome.items": "PlanItem", "Appointment.questions": "VisitQuestion", "Appointment.notes": "VisitNotes", "VisitNotes.nextSteps": "NextStep",
  "State.calls": "CallEntry", "CallEntry.nextStep": "CallStep", "State.aboutMe": "AboutMe", "State.aways": "Away", "AboutMe.sections": "AboutSection",
  "State.settings": "Settings",
};

const stateFields = () => interfaceFields(read("src/data/types.ts"));
const stateFieldsOnly = Object.fromEntries(Object.entries(STATE_CLASSIFICATION).map(([k, v]) => [k, v.fields]));
// A fresh in-memory Postgres per call: the first one pays PGlite's cold start (see config-and-export.test.ts).
const SLOW_DB = { timeout: 20_000 };

/**
 * Member ids that aren't named `by`/`…By`. The who-and-when check goes by field
 * name: a new who or when field with another kind of name (`checkIn`,
 * `expiresOn`) isn't caught by it, so name new ones `…By`/`…At` or add them here.
 */
const MEMBER_REFS = ["caregiverId", "responderId", "escortId", "actorId", "assignee"];

/* ---------- The checks ---------- */

describe("data classification (CC-9)", () => {
  it("tags every field of the demo state", () => {
    expect(gaps(stateFields(), stateFieldsOnly, "Interface")).toEqual([]);
  });

  it("tags every field the live demo data holds, as a check that doesn't rely on reading types.ts", () => {
    const s = seed();
    evaluate(s);
    const found = dataFields(s, "State", stateFieldsOnly, LINKS);
    expect(Object.keys(found).length).toBeGreaterThanOrEqual(18);
    expect(unclassified(found, stateFieldsOnly)).toEqual([]);
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

  it("treats readable ids (medicines, tasks, approvals, shifts), and keys built from them, as PHI", () => {
    const f = (e: string, k: string) => STATE_CLASSIFICATION[e].fields[k];
    expect(f("Medication", "id")).toBe("PHI");
    expect(f("Appointment", "id")).toBe("PHI"); // "appt-auto-med-lisinopril-…" (everyday.ts autoRefillId)
    expect(f("CareTask", "id")).toBe("PHI"); // "t-bath"
    expect(f("TaskLog", "taskId")).toBe("PHI");
    expect(f("Approval", "id")).toBe("PHI"); // "ap-metformin"
    expect(f("MedSupply", "bottleId")).toBe("PHI"); // "b-" + the time it was counted
    expect(f("Shift", "id")).toBe("PHI"); // "s-ana"
    expect(f("Visit", "shiftId")).toBe("PHI");
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
    expect(() => interfaceFields("export interface A { [k: string]: number }")).toThrow(/Can't read the member|Read 1 members but counted 0/);
    expect(() => interfaceFields("export interface B extends Missing { y: string }")).toThrow(/isn't declared here/);
    expect(() => interfaceFields("export type U = { a: string } | { b: string };")).toThrow(/Can't read the type/);
    expect(() => interfaceFields("export type X = Base &\n")).toThrow(/Can't read the type/);
    expect(() => interfaceFields("export enum E { A, B }")).toThrow(/only interfaces and type aliases/);
    expect(() => interfaceFields("export class K { a = 1 }")).toThrow(/only interfaces and type aliases/);
    expect(() => interfaceFields("export interface A { status:\n  | \"a\"\n  | \"b\";\n  ssn: string }")).toThrow();
  });

  it("doesn't lose a field after a function type, a comma, a // in a string, or a type split over lines", () => {
    expect(interfaceFields("export interface A { onDone: () => void;\n secret: string }").A).toEqual(["onDone", "secret"]);
    expect(interfaceFields("export interface A { m: Record<string, () => void>; ssn: string }").A).toEqual(["m", "ssn"]);
    expect(interfaceFields("export interface A { name: string, ssn: string; pill: { color: string, shape: string } }").A).toEqual(["name", "ssn", "pill.color", "pill.shape"]);
    expect(interfaceFields("export interface A { link: \"https://x\"; b: 'a//b'; c: `x//${1}`; ssn: string }").A).toEqual(["link", "b", "c", "ssn"]);
    expect(interfaceFields("export interface Base { a: string }\nexport type X = Base &\n  { ssn: string };").X).toEqual(["ssn"]);
    expect(interfaceFields("export type G<T = string> = { v: T; w: number };").G).toEqual(["v", "w"]);
  });

  it("finds a field in the live data that the types don't list", () => {
    const data = { name: "x", pill: { color: "red", glow: true }, members: [{ id: "a", nickname: "b" }] };
    const found = dataFields(data, "Root", { Root: { name: "PHI", "pill.color": "PHI" }, Member: { id: "Operational" } }, { "Root.members": "Member" });
    expect(unclassified(found, { Root: { name: "PHI", "pill.color": "PHI" }, Member: { id: "Operational" } })).toEqual([
      "Root.pill.glow is in the demo data but has no data class", "Member.nickname is in the demo data but has no data class",
    ]);
  });

  it("names columns that the database has, however the SQL was written", SLOW_DB, async () => {
    const sql = [
      'CREATE UNLOGGED TABLE "Odd" (a int);',
      "CREATE TABLE\n  public.plain_two (b int);",
      "ALTER TABLE IF EXISTS users ADD mfa_secret text, ADD COLUMN mfa_backup text;",
      "ALTER TABLE sessions RENAME COLUMN user_id TO owner_id;",
      "CREATE TABLE copied AS SELECT 1 AS c;",
      "CREATE MATERIALIZED VIEW mv_people AS SELECT id, ssn_last4 FROM elders;",
      "CREATE SCHEMA private; CREATE TABLE private.secrets (k text);",
    ].join("\n");
    const cols = await databaseColumns(sql);
    const problems = gaps(cols, DB_CLASSIFICATION, "Table");
    expect(problems).toEqual(expect.arrayContaining([
      "Table Odd has no classification", "Table plain_two has no classification", "Table copied has no classification",
      "Table mv_people has no classification", "Table private.secrets has no classification",
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
    const m = line.match(/^\| `([\w.]+)` \|(.*)\|\s*$/);
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

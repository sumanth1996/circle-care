// CC-10: keeps the threat model (docs/security/10-threat-model.md) honest as the code changes.
// Every `file:symbol` reference must still point at code (not a comment) that contains the symbol,
// every threat row must be well formed with a risk that follows from its impact and likelihood,
// and every High risk without a full control must have a story.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const DOC = readFileSync(resolve(ROOT, "docs/security/10-threat-model.md"), "utf8");

/** Change this when threats are added or removed, so a row can't drop out of the parse unnoticed. */
const THREAT_COUNT = 57;

const REF = /`((?:[\w.-]+\/)*[\w.-]+\.(?:ts|tsx|js|sql|yml|json|html)|\.replit):([^`]+)`/g;
const STATUSES = ["In place", "Partial", "Demo only", "Missing"];
const LEVELS = ["High", "Medium", "Low"];
const OWNERS = ["Dev Agent", "Release Agent", "Security officer", "PO"];
const SCORE: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

interface Row { id: string; stride: string; control: string; status: string; impact: string; likelihood: string; risk: string; owner: string; story: string }

function threatRows(doc: string): Row[] {
  const rows: Row[] = [];
  // Threat rows live in section 4. Anything there that starts like one must parse; a typo can't hide a row.
  const section = doc.slice(doc.indexOf("\n## 4. "), doc.indexOf("\n## 5. "));
  for (const line of section.split("\n")) {
    if (!/^\|\s*C\d/.test(line)) continue;
    const m = /^\| (C\d+-[STRIDE]\d+) \|(.*)\|\s*$/.exec(line);
    if (!m) throw new Error(`Malformed threat row: ${line}`);
    const cells = m[2].split(" | ").map((c) => c.trim());
    if (cells.length !== 9) throw new Error(`Threat ${m[1]} has ${cells.length + 1} cells, expected 10: ${line}`);
    const [stride, , control, status, impact, likelihood, risk, owner, story] = cells;
    rows.push({ id: m[1], stride, control, status, impact, likelihood, risk, owner, story });
  }
  return rows;
}

/** Risk from §3: score High 3, Medium 2, Low 1 and multiply; 6+ High, 3-4 Medium, else Low. */
function riskOf(impact: string, likelihood: string) {
  const s = SCORE[impact] * SCORE[likelihood];
  return s >= 6 ? "High" : s >= 3 ? "Medium" : "Low";
}

/** True when the symbol appears in code, not only in a comment. */
function inCode(file: string, text: string, symbol: string) {
  const ext = file.slice(file.lastIndexOf("."));
  const marker = ext === ".sql" ? /--/ : ext === ".yml" || file.endsWith(".replit") ? /(^|\s)#/ : ext === ".html" ? /<!--/ : ext === ".json" ? null : /(^|\s)\/\//;
  return text.split("\n").some((line) => {
    const at = line.indexOf(symbol);
    if (at < 0) return false;
    const before = line.slice(0, at);
    if (/^\s*(\*|\/\*)/.test(line) && ext !== ".sql") return false; // inside a block comment
    return !marker || !marker.test(before);
  });
}

describe("threat model (CC-10)", () => {
  const rows = threatRows(DOC);

  it("lists threats for every component in scope", () => {
    expect(rows.length).toBe(THREAT_COUNT);
    for (let c = 1; c <= 10; c++) {
      expect(DOC, `section for C${c}`).toMatch(new RegExp(`^### C${c} `, "m"));
      expect(rows.some((r) => r.id.startsWith(`C${c}-`)), `threats for C${c}`).toBe(true);
    }
    for (const name of ["Web app", "Express API", "Postgres", "vault", "sessions and MFA", "Demo store", "GitHub Actions", "GitHub Pages"]) {
      expect(DOC).toContain(name);
    }
    expect(rows.filter((r) => r.stride === "D").length, "availability threats").toBeGreaterThanOrEqual(5);
  });

  it("gives every threat a unique id, a STRIDE letter matching its id, and known status, ratings and owner", () => {
    const seen = new Set<string>();
    for (const r of rows) {
      expect(seen.has(r.id), `duplicate ${r.id}`).toBe(false);
      seen.add(r.id);
      expect(r.stride, r.id).toBe(r.id.split("-")[1][0]);
      expect(STATUSES, `${r.id} status`).toContain(r.status);
      expect(LEVELS, `${r.id} impact`).toContain(r.impact);
      expect(LEVELS, `${r.id} likelihood`).toContain(r.likelihood);
      expect(OWNERS, `${r.id} owner`).toContain(r.owner);
      expect(r.story, `${r.id} story`).toMatch(/^(CC-\d+)?$/);
    }
  });

  it("derives every risk from its impact and likelihood", () => {
    for (const r of rows) expect(r.risk, `${r.id}: ${r.impact} impact, ${r.likelihood} likelihood`).toBe(riskOf(r.impact, r.likelihood));
  });

  it("names the code for every control that exists", () => {
    for (const r of rows.filter((x) => x.status !== "Missing")) {
      expect([...r.control.matchAll(REF)].length, `${r.id} (${r.status}) names no file`).toBeGreaterThan(0);
    }
  });

  it("has a backlog story for every High risk that isn't fully in place", () => {
    const open = rows.filter((r) => r.risk === "High" && r.status !== "In place");
    expect(open.length).toBeGreaterThan(0);
    for (const r of open) {
      expect(r.story, `${r.id} needs a story`).toMatch(/^CC-\d+$/);
      expect(DOC, `${r.id} in the High risks table with its status`).toMatch(new RegExp(`^\\| [^|]*${r.id}[^|]*\\| High \\| ${r.status} \\| ${r.story} `, "m"));
    }
  });

  it("lists in the High risks table only threats that are High and not in place", () => {
    const table = DOC.slice(DOC.indexOf("\n## 5. "), DOC.indexOf("\n## 6. "));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const listed = [...table.matchAll(/\bC\d+-[STRIDE]\d+\b/g)].map((m) => m[0]);
    const firstCells = table.split("\n").filter((l) => /^\| C\d/.test(l)).map((l) => l.split(" | ")[0]);
    const inTable = listed.filter((id) => firstCells.some((c) => c.includes(id)));
    expect(inTable.length).toBeGreaterThan(0);
    for (const id of inTable) {
      const r = byId.get(id);
      expect(r, `${id} is not a threat in section 4`).toBeDefined();
      expect(r!.risk, `${id} risk`).toBe("High");
      expect(r!.status, `${id} status`).not.toBe("In place");
    }
  });

  it("points only at files that exist and still contain the named code outside comments", () => {
    const refs = [...DOC.matchAll(REF)];
    expect(refs.length).toBeGreaterThan(50);
    const missing: string[] = [];
    for (const [, file, symbol] of refs) {
      const path = resolve(ROOT, file);
      if (!existsSync(path)) { missing.push(`${file} (no such file)`); continue; }
      if (!inCode(file, readFileSync(path, "utf8"), symbol)) missing.push(`${file}: ${symbol}`);
    }
    expect(missing).toEqual([]);
  });

  it("keeps the warning that it still needs a security engineer and the security officer", () => {
    expect(DOC).toMatch(/^!!! warning "Still needs human security review"\n {4}.*\*\*an engineer with security experience\*\*.*\*\*designated security officer\*\*/m);
  });
});

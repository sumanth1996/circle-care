// CC-10: keeps the threat model (docs/security/10-threat-model.md) honest as the code changes.
// Every `file:symbol` reference must still point at a file that contains the symbol, every
// threat row must be well formed, and every High risk without a full control must have a story.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const DOC = readFileSync(resolve(ROOT, "docs/security/10-threat-model.md"), "utf8");

const REF = /`((?:[\w.-]+\/)*[\w.-]+\.(?:ts|tsx|js|sql|yml|json|html)|\.replit):([^`]+)`/g;
const STATUSES = ["In place", "Partial", "Demo only", "Missing"];
const RISKS = ["High", "Medium", "Low"];
const OWNERS = ["Dev Agent", "Release Agent", "Security officer", "PO"];

interface Row { id: string; stride: string; status: string; risk: string; owner: string; story: string; line: string }

function threatRows(doc: string): Row[] {
  const rows: Row[] = [];
  for (const line of doc.split("\n")) {
    const m = /^\| (C\d+-[STRIDE]\d+) \|(.*)\|\s*$/.exec(line);
    if (!m) continue;
    const cells = m[2].split(" | ").map((c) => c.trim());
    if (cells.length !== 7) throw new Error(`Threat ${m[1]} has ${cells.length + 1} cells, expected 8: ${line}`);
    const [stride, , , status, risk, owner, story] = cells;
    rows.push({ id: m[1], stride, status, risk, owner, story, line });
  }
  return rows;
}

describe("threat model (CC-10)", () => {
  const rows = threatRows(DOC);

  it("lists threats for every component in scope", () => {
    expect(rows.length).toBeGreaterThan(30);
    for (let c = 1; c <= 10; c++) {
      expect(DOC, `section for C${c}`).toMatch(new RegExp(`^### C${c} `, "m"));
      expect(rows.some((r) => r.id.startsWith(`C${c}-`)), `threats for C${c}`).toBe(true);
    }
    for (const name of ["Web app", "Express API", "Postgres", "vault", "sessions and MFA", "Demo store", "GitHub Actions", "GitHub Pages"]) {
      expect(DOC).toContain(name);
    }
  });

  it("gives every threat a unique id, a STRIDE letter matching its id, and known status, risk and owner", () => {
    const seen = new Set<string>();
    for (const r of rows) {
      expect(seen.has(r.id), `duplicate ${r.id}`).toBe(false);
      seen.add(r.id);
      expect(r.stride, r.id).toBe(r.id.split("-")[1][0]);
      expect(STATUSES, `${r.id} status`).toContain(r.status);
      expect(RISKS, `${r.id} risk`).toContain(r.risk);
      expect(OWNERS, `${r.id} owner`).toContain(r.owner);
    }
  });

  it("has a backlog story for every High risk that isn't fully in place", () => {
    const open = rows.filter((r) => r.risk === "High" && r.status !== "In place");
    expect(open.length).toBeGreaterThan(0);
    for (const r of open) {
      expect(r.story, `${r.id} needs a story`).toMatch(/^CC-\d+$/);
      expect(DOC, `${r.id} in the High risks table`).toMatch(new RegExp(`^\\| [^|]*${r.id}[^|]*\\| High \\|[^|]*\\| ${r.story} `, "m"));
    }
  });

  it("points only at files that exist and still contain the named code", () => {
    const refs = [...DOC.matchAll(REF)];
    expect(refs.length).toBeGreaterThan(30);
    const missing: string[] = [];
    for (const [, file, symbol] of refs) {
      const path = resolve(ROOT, file);
      if (!existsSync(path)) { missing.push(`${file} (no such file)`); continue; }
      if (!readFileSync(path, "utf8").includes(symbol)) missing.push(`${file}: ${symbol}`);
    }
    expect(missing).toEqual([]);
  });

  it("still says it needs a security engineer and the security officer", () => {
    expect(DOC).toMatch(/engineer with security experience/);
    expect(DOC).toMatch(/security officer/);
  });
});

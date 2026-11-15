// CC-9: readers for the classification check (src/__tests__/classification.test.ts).
// Kept out of the *.test.ts file so that importing them doesn't register that file's suites twice.

import { loadConfig } from "../../server/config";
import { openDb } from "../../server/db";
import { migrate } from "../../server/migrate";
import type { DataClass } from "../data/classification";

/* ---------- TypeScript declarations ---------- */

/**
 * One pass over the source: comments are removed, and the contents of every
 * '…', "…" and `…` string are blanked, so neither a "//" inside a string nor
 * a brace or semicolon inside one can confuse the reader.
 */
export function tokenize(ts: string): string {
  let out = "";
  for (let i = 0; i < ts.length; i++) {
    const ch = ts[i];
    if (ch === "/" && ts[i + 1] === "/") { while (i < ts.length && ts[i] !== "\n") i++; out += "\n"; continue; }
    if (ch === "/" && ts[i + 1] === "*") {
      const end = ts.indexOf("*/", i + 2);
      if (end < 0) throw new Error("Unclosed comment");
      out += ts.slice(i, end + 2).replace(/[^\n]/g, " ");
      i = end + 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      for (; j < ts.length && ts[j] !== ch; j++) if (ts[j] === "\\") j++;
      if (j >= ts.length) throw new Error("Unclosed string");
      out += ch + ch;
      i = j;
      continue;
    }
    out += ch;
  }
  return out;
}

const OPEN = "{[(<", CLOSE = "}])>";
/** Is the character at `i` a bracket? The ">" of an arrow ("=>") is not. */
const bracket = (s: string, i: number): 1 | -1 | 0 =>
  OPEN.includes(s[i]) ? 1 : CLOSE.includes(s[i]) && !(s[i] === ">" && s[i - 1] === "=") ? -1 : 0;

/** Text between the bracket at `open` and its partner. */
export function inside(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    depth += bracket(src, i);
    if (depth === 0) return src.slice(open + 1, i);
  }
  throw new Error(`Unclosed ${src[open]} at ${open}`);
}

/** Split at top level (outside brackets) on any of `seps`. */
function splitTop(body: string, seps: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (let i = 0; i < body.length; i++) {
    depth += bracket(body, i);
    if (depth < 0) throw new Error(`Unbalanced brackets in "${body}"`);
    if (depth === 0 && seps.includes(body[i])) { out.push(cur); cur = ""; } else cur += body[i];
  }
  if (depth !== 0) throw new Error(`Unbalanced brackets in "${body}"`);
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** The body with everything inside nested brackets blanked: only its own top level is left. */
function topLevel(body: string): string {
  let depth = 0, out = "";
  for (let i = 0; i < body.length; i++) {
    const b = bracket(body, i);
    if (b === 1) depth++;
    out += depth === 0 ? body[i] : body[i] === "\n" ? "\n" : " ";
    if (b === -1) depth--;
  }
  return out;
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
 * It refuses, rather than skips, anything it can't read: a class, enum or
 * namespace; a declaration it can't parse; a member it can't split; an inline
 * object inside a union, an intersection or another generic. As a check that
 * doesn't rely on the splitting, it also counts the "name:" starts at the top
 * level of each body and fails if that differs from the members it read.
 */
export function interfaceFields(ts: string): Record<string, string[]> {
  const src = tokenize(ts);
  const other = src.match(/\b(class|enum|namespace|module)\s+\w+/);
  if (other) throw new Error(`Can't read "${other[0]}": only interfaces and type aliases are supported`);
  type Decl = { name: string; body: string | null; parents: string[] };
  const decls: Decl[] = [];
  for (const m of src.matchAll(/\b(?:export\s+)?(?:declare\s+)?(interface|type)\s+(\w+)\s*(<)?/g)) {
    let i = m.index! + m[0].length;
    for (let d = m[3] ? 1 : 0; d; i++) d += bracket(src, i);
    if (m[1] === "interface") {
      const brace = src.indexOf("{", i);
      const head = src.slice(i, brace).trim();
      const ext = head.match(/^extends\s+([\s\S]+)$/);
      if (head && !ext) throw new Error(`Can't read the interface ${m[2]}: "${head}"`);
      const parents = ext ? splitTop(ext[1], ",").map((p) => p.replace(/<[\s\S]*>$/, "").trim()) : [];
      decls.push({ name: m[2], body: inside(src, brace), parents });
      continue;
    }
    const eq = src.slice(i).match(/^\s*=\s*/);
    if (!eq) throw new Error(`Can't read the type ${m[2]}`);
    const start = i + eq[0].length;
    let depth = 0, j = start;
    for (; j < src.length; j++) {
      depth += bracket(src, j);
      if (depth !== 0) continue;
      if (src[j] === ";") break;
      // A line break ends the alias unless the type goes on: a line ending in, or one starting with, | or &.
      if (src[j] === "\n" && !/[|&]\s*$/.test(src.slice(start, j)) && !/^\s*[|&]/.test(src.slice(j + 1))) break;
    }
    const rhs = src.slice(start, j).trim().replace(/^[|&]\s*/, "");
    if (/[|&]$/.test(rhs)) throw new Error(`Can't read the type ${m[2]}: "${rhs}"`);
    const parts = splitTop(rhs, "&");
    if (parts.length > 1 || isObject(rhs)) {
      const objects = parts.filter(isObject);
      if (objects.length + parts.filter((p) => /^\w+$/.test(p)).length !== parts.length) throw new Error(`Can't read the type ${m[2]}: "${rhs}"`);
      decls.push({ name: m[2], body: objects.map((o) => inside(o, 0)).join(";\n"), parents: parts.filter((p) => !isObject(p)) });
    } else if (rhs.includes("{")) {
      throw new Error(`Can't read the type ${m[2]}: an object inside "${rhs}"`);
    } else decls.push({ name: m[2], body: null, parents: [] });
  }
  const names = new Set<string>();
  for (const d of decls) { if (names.has(d.name)) throw new Error(`${d.name} is declared twice`); names.add(d.name); }
  const objects = new Set(decls.filter((d) => d.body !== null).map((d) => d.name));
  for (const d of decls) for (const p of d.parents) if (!objects.has(p)) throw new Error(`${d.name} extends ${p}, which isn't declared here`);

  const strip = (t: string): string => {
    let x = t.trim();
    while (x.startsWith("(") && inside(x, 0).length + 2 === x.length) x = x.slice(1, -1).trim();
    const parts = splitTop(x, "|").filter((p) => p !== "null" && p !== "undefined");
    return parts.length === 1 ? parts[0] : parts.join(" | ");
  };
  const walk = (body: string, prefix: string): string[] => {
    const members = splitTop(body, ";,\n");
    const starts = (topLevel(body).match(/(^|[;,\n])\s*(readonly\s+)?\w+\??\s*:/g) ?? []).length;
    if (starts !== members.length) throw new Error(`Read ${members.length} members but counted ${starts} in "${prefix || "{"}…"`);
    return members.flatMap((member) => {
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
  };
  const out: Record<string, string[]> = {};
  for (const d of decls) if (d.body !== null) out[d.name] = walk(d.body, "");
  return out;
}

/* ---------- The live demo data ---------- */

/** Where one entity's records sit inside another's: "State.members" holds Members. */
export type Links = Record<string, string>;

/**
 * Every key path in a real object, by entity, so a field the type reader
 * missed still shows up if the data holds it. A path that `classified` names
 * is a leaf; a link goes on to the linked entity; any other object is walked
 * by its keys ("pill.color"), and arrays by their items.
 */
export function dataFields(root: unknown, entity: string, classified: Record<string, Record<string, DataClass>>, links: Links): Record<string, string[]> {
  const out: Record<string, Set<string>> = {};
  const visit = (value: unknown, ent: string, prefix: string) => {
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) { for (const v of value) visit(v, ent, prefix); return; }
    for (const [k, v] of Object.entries(value)) {
      const path = prefix + k;
      const link = links[`${ent}.${path}`];
      if (link) { visit(v, link, ""); continue; }
      (out[ent] ??= new Set());
      if (path in (classified[ent] ?? {})) { out[ent].add(path); continue; }
      if (Array.isArray(v) && v.length === 0) continue; // nothing to learn from an empty list
      const items = Array.isArray(v) ? v : [v];
      if (items.length && items.every((x) => x !== null && typeof x === "object" && !Array.isArray(x))) visit(v, ent, `${path}.`);
      else out[ent].add(path);
    }
  };
  visit(root, entity, "");
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
}

/* ---------- Postgres ---------- */

/**
 * Columns of every table, partitioned table, view, materialized view and
 * foreign table in every non-system schema, read from Postgres's own catalog
 * after running the migrations on an in-memory database. Names outside the
 * public schema carry their schema ("private.secrets").
 */
export async function databaseColumns(extraSql = ""): Promise<Record<string, string[]>> {
  const db = await openDb(loadConfig({ APP_ENV: "test" }), { memory: true });
  try {
    await migrate(db);
    if (extraSql) await db.exec(extraSql);
    const { rows } = await db.query<{ s: string; t: string; c: string }>(
      `SELECT n.nspname AS s, c.relname AS t, a.attname AS c
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND a.attnum > 0 AND NOT a.attisdropped
          AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp%' AND n.nspname NOT LIKE 'pg_toast_temp%'
        ORDER BY n.nspname, c.relname, a.attnum`);
    const out: Record<string, string[]> = {};
    for (const r of rows) (out[r.s === "public" ? r.t : `${r.s}.${r.t}`] ??= []).push(r.c);
    return out;
  } finally {
    await db.close();
  }
}

/* ---------- Comparing ---------- */

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

/** Fields the data holds that have no class (stale entries aren't checked: demo data needn't fill every field). */
export function unclassified(found: Record<string, string[]>, classified: Record<string, Record<string, DataClass>>) {
  return Object.entries(found).flatMap(([e, fs]) => (classified[e] ? fs.filter((f) => !(f in classified[e])).map((f) => `${e}.${f} is in the demo data but has no data class`) : [`${e} is in the demo data but has no classification`]));
}

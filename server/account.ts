// My account: profile, SSN, photo and activity (CC-176 – CC-181, CC-185).

import express, { Router } from "express";
import { checkSsn, normEmail, normName, normPhone, type Role } from "../src/lib/validation";
import { audit, describe } from "./audit";
import { PERSONA_TABLE, requireUser, type Deps } from "./auth";
import { decrypt, encrypt, fingerprint, verifyPassword } from "./crypto";
import type { Queryable } from "./db";
import { HttpError, route, str } from "./http";

export type MissingItem = "ssn" | "bank_account";

export interface MeView {
  id: string;
  role: Role;
  loginEmail: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  /** Only ever the last four digits — the full SSN never leaves the server (CC-181). */
  ssnLast4: string | null;
  hasPhoto: boolean;
  profileStatus: "complete" | "incomplete";
  missing: MissingItem[];
  createdAt: string;
}

export async function loadMe(q: Queryable, userId: string): Promise<MeView> {
  const u = (await q.query<{ id: string; role: Role; email: string; created_at: Date }>("SELECT id, role, email, created_at FROM users WHERE id = $1", [userId])).rows[0];
  if (!u) throw new HttpError(401, "Please sign in.");
  const p = (await q.query<{ first_name: string; last_name: string; phone: string; email: string; ssn_last4: string | null }>(
    `SELECT first_name, last_name, phone, email, ssn_last4 FROM ${PERSONA_TABLE[u.role]} WHERE user_id = $1`, [userId])).rows[0];
  const photo = (await q.query("SELECT 1 FROM photos WHERE user_id = $1", [userId])).rows.length > 0;
  const missing: MissingItem[] = [];
  if (!p.ssn_last4) missing.push("ssn");
  if (u.role === "guardian" && !(await q.query("SELECT 1 FROM bank_accounts WHERE user_id = $1", [userId])).rows.length) missing.push("bank_account");
  return {
    id: u.id, role: u.role, loginEmail: u.email,
    firstName: p.first_name, lastName: p.last_name, phone: p.phone, email: p.email,
    ssnLast4: p.ssn_last4 ? String(p.ssn_last4) : null,
    hasPhoto: photo,
    profileStatus: missing.length ? "incomplete" : "complete",
    missing,
    createdAt: new Date(u.created_at).toISOString(),
  };
}

/** Accepts only real image files, by their first bytes, whatever the Content-Type says. */
export function sniffImage(b: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

export function accountRouter(d: Deps): Router {
  const r = Router();
  r.use(requireUser);

  r.get("/", route(async (req, res) => { res.json({ me: await loadMe(d.db, req.user!.id) }); }));

  r.patch("/", route(async (req, res) => {
    const u = req.user!;
    const b = req.body ?? {};
    const updates: Record<string, string> = {};
    const fields: Record<string, string> = {};
    const check = (key: string, col: string, v: { value?: string; error?: string }) => { if (b[key] === undefined) return; if (v.error) fields[key] = v.error; else updates[col] = v.value!; };
    check("firstName", "first_name", normName(str(b.firstName)));
    check("lastName", "last_name", normName(str(b.lastName)));
    check("phone", "phone", normPhone(str(b.phone)));
    check("email", "email", normEmail(str(b.email)));
    const first = Object.keys(fields)[0];
    if (first) throw new HttpError(400, fields[first], first, fields);
    const cols = Object.keys(updates);
    if (cols.length) {
      const now = d.now();
      await d.db.tx(async (q) => {
        await q.query(`UPDATE ${PERSONA_TABLE[u.role]} SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")}, updated_at = $${cols.length + 2} WHERE user_id = $1`, [u.id, ...cols.map((c) => updates[c]), now]);
        await audit(q, { action: "profile.updated", actor: u.id, detail: { fields: cols }, at: now });
      });
    }
    res.json({ me: await loadMe(d.db, u.id) });
  }));

  r.put("/ssn", route(async (req, res) => {
    const u = req.user!;
    const table = PERSONA_TABLE[u.role];
    const checked = checkSsn(str(req.body?.ssn), d.cfg.testData);
    if (checked.error) {
      if (d.cfg.testData && /test environment/.test(checked.error)) await audit(d.db, { action: "nonprod.blocked", actor: u.id, detail: { field: "ssn" }, at: d.now() });
      throw new HttpError(400, checked.error, "ssn");
    }
    const digits = checked.digits!;
    const existing = (await d.db.query<{ ssn_enc: string | null }>(`SELECT ssn_enc FROM ${table} WHERE user_id = $1`, [u.id])).rows[0];
    if (existing?.ssn_enc) {
      // Changing an SSN needs the password again (CC-180).
      const pw = (await d.db.query<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [u.id])).rows[0];
      if (!(await verifyPassword(str(req.body?.password), pw.password_hash))) throw new HttpError(403, "Enter your password to change your Social Security number.", "password");
      if (decrypt(d.cfg, existing.ssn_enc).toString("utf8") === digits) { res.json({ me: await loadMe(d.db, u.id) }); return; }
    }
    const fp = fingerprint(d.cfg, digits);
    const last4 = digits.slice(5);
    const now = d.now();
    const ok = await d.db.tx(async (q) => {
      const taken = (await q.query<{ user_id: string }>("SELECT user_id FROM ssn_fingerprints WHERE fingerprint = $1", [fp])).rows[0];
      if (taken && taken.user_id !== u.id) {
        await audit(q, { action: "ssn.duplicate", actor: u.id, at: now });
        return false;
      }
      await q.query("DELETE FROM ssn_fingerprints WHERE user_id = $1", [u.id]);
      await q.query("INSERT INTO ssn_fingerprints (fingerprint, user_id) VALUES ($1, $2)", [fp, u.id]);
      await q.query(`UPDATE ${table} SET ssn_enc = $2, ssn_last4 = $3, updated_at = $4 WHERE user_id = $1`, [u.id, encrypt(d.cfg, digits), last4, now]);
      await audit(q, { action: existing?.ssn_enc ? "ssn.changed" : "ssn.set", actor: u.id, detail: { last4 }, at: now });
      return true;
    });
    if (!ok) throw new HttpError(409, "This number can't be used. Contact support.", "ssn");
    res.json({ me: await loadMe(d.db, u.id) });
  }));

  r.put("/photo", express.raw({ type: () => true, limit: "2mb" }), route(async (req, res) => {
    const u = req.user!;
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const type = sniffImage(body);
    if (!type) throw new HttpError(415, "Choose a JPEG, PNG or WebP photo.", "photo");
    const now = d.now();
    await d.db.tx(async (q) => {
      await q.query(
        `INSERT INTO photos (user_id, content_type, data_enc, size_bytes, updated_at) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET content_type = EXCLUDED.content_type, data_enc = EXCLUDED.data_enc, size_bytes = EXCLUDED.size_bytes, updated_at = EXCLUDED.updated_at`,
        [u.id, type, encrypt(d.cfg, body), body.length, now]);
      await audit(q, { action: "photo.updated", actor: u.id, detail: { bytes: body.length, type }, at: now });
    });
    res.json({ me: await loadMe(d.db, u.id) });
  }));

  r.get("/photo", route(async (req, res) => {
    const row = (await d.db.query<{ content_type: string; data_enc: string }>("SELECT content_type, data_enc FROM photos WHERE user_id = $1", [req.user!.id])).rows[0];
    if (!row) throw new HttpError(404, "No photo");
    res.setHeader("Content-Type", row.content_type);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(decrypt(d.cfg, row.data_enc));
  }));

  r.delete("/photo", route(async (req, res) => {
    const u = req.user!;
    const now = d.now();
    await d.db.tx(async (q) => {
      const del = await q.query("DELETE FROM photos WHERE user_id = $1 RETURNING user_id", [u.id]);
      if (del.rows.length) await audit(q, { action: "photo.removed", actor: u.id, at: now });
    });
    res.json({ me: await loadMe(d.db, u.id) });
  }));

  r.get("/activity", route(async (req, res) => {
    const { rows } = await d.db.query<{ at: Date; action: string; detail: Record<string, unknown> | string }>(
      "SELECT at, action, detail FROM audit_events WHERE subject_user_id = $1 ORDER BY at DESC, id DESC LIMIT 20", [req.user!.id]);
    res.json({
      events: rows.map((e) => {
        const detail = typeof e.detail === "string" ? JSON.parse(e.detail) : e.detail;
        return { at: new Date(e.at).toISOString(), action: e.action, text: describe(e.action, detail) };
      }),
    });
  }));

  return r;
}

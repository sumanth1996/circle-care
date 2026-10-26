// Guardian payment methods (CC-186 – CC-188). The API only ever sees vault
// tokens: card and bank numbers go straight from the browser to the vault.

import { Router } from "express";
import { BRAND_LABEL, type Brand } from "../src/lib/validation";
import { audit } from "./audit";
import { requireUser, type Deps } from "./auth";
import type { Queryable } from "./db";
import { HttpError, route, str } from "./http";

const MAX_CARDS = 5;
const TOKEN_TTL_MS = 15 * 60_000;

type TokenRow = { token: string; kind: string; owner_user_id: string; metadata: Record<string, unknown> | string; created_at: Date; attached_at: Date | null; revoked_at: Date | null };

export async function paymentMethods(q: Queryable, userId: string) {
  const bank = (await q.query<{ id: string; bank_name: string; holder_name: string; account_type: string; account_last4: string; routing_last4: string; ach_fee_cents: number; created_at: Date }>(
    "SELECT id, bank_name, holder_name, account_type, account_last4, routing_last4, ach_fee_cents, created_at FROM bank_accounts WHERE user_id = $1", [userId])).rows[0];
  const cards = (await q.query<{ id: string; holder_name: string; brand: Brand; funding: string; last4: string; exp_month: number; exp_year: number; is_primary: boolean; created_at: Date }>(
    "SELECT id, holder_name, brand, funding, last4, exp_month, exp_year, is_primary, created_at FROM payment_cards WHERE user_id = $1 ORDER BY is_primary DESC, created_at DESC", [userId])).rows;
  return {
    bankAccount: bank ? {
      id: bank.id, bankName: bank.bank_name, holderName: bank.holder_name, accountType: bank.account_type,
      accountLast4: String(bank.account_last4), routingLast4: String(bank.routing_last4), achFeeCents: bank.ach_fee_cents, createdAt: new Date(bank.created_at).toISOString(),
    } : null,
    cards: cards.map((c) => ({
      id: c.id, holderName: c.holder_name, brand: c.brand, brandLabel: BRAND_LABEL[c.brand] ?? "Card", funding: c.funding,
      last4: String(c.last4), expMonth: c.exp_month, expYear: c.exp_year, isPrimary: c.is_primary, createdAt: new Date(c.created_at).toISOString(),
    })),
    fees: { achCents: 0, note: "ACH bank transfers have no platform fee." },
    maxCards: MAX_CARDS,
  };
}

/** Claims a vault token: it must belong to this user, match the kind, be fresh and unused. */
async function claim(q: Queryable, token: string, userId: string, kind: "bank_account" | "card", now: Date) {
  const t = (await q.query<TokenRow>("SELECT * FROM vault_tokens WHERE token = $1 FOR UPDATE", [token])).rows[0];
  if (!t || t.owner_user_id !== userId || t.kind !== kind || t.revoked_at || t.attached_at || now.getTime() - new Date(t.created_at).getTime() > TOKEN_TTL_MS) {
    throw new HttpError(400, "That payment method has expired. Please enter it again.");
  }
  await q.query("UPDATE vault_tokens SET attached_at = $2 WHERE token = $1", [token, now]);
  return typeof t.metadata === "string" ? JSON.parse(t.metadata) : t.metadata;
}

export function paymentsRouter(d: Deps): Router {
  const r = Router();
  r.use(requireUser);
  r.use((req, _res, next) => (req.user!.role === "guardian" ? next() : next(new HttpError(403, "Payment methods are managed by the legal guardian."))));
  const live = () => { if (d.cfg.paymentProvider === "stripe") throw new HttpError(503, "Adding payment methods isn't available yet in this environment."); };

  r.get("/", route(async (req, res) => { res.json(await paymentMethods(d.db, req.user!.id)); }));

  r.post("/bank-account", route(async (req, res) => {
    live();
    const u = req.user!;
    const now = d.now();
    await d.db.tx(async (q) => {
      const m = await claim(q, str(req.body?.token), u.id, "bank_account", now);
      const old = (await q.query<{ id: string }>("SELECT id FROM bank_accounts WHERE user_id = $1", [u.id])).rows[0];
      // Replace safely: the new account is written in the same transaction the old one is removed.
      if (old) await q.query("DELETE FROM bank_accounts WHERE id = $1", [old.id]);
      await q.query(
        "INSERT INTO bank_accounts (user_id, vault_token, bank_name, holder_name, account_type, account_last4, routing_last4, ach_fee_cents, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8)",
        [u.id, str(req.body?.token), m.bankName, m.holderName, m.accountType, m.accountLast4, m.routingLast4, now]);
      await audit(q, { action: old ? "bank.replaced" : "bank.added", actor: u.id, detail: { last4: m.accountLast4, bank: m.bankName }, at: now });
    });
    res.status(201).json(await paymentMethods(d.db, u.id));
  }));

  r.post("/cards", route(async (req, res) => {
    live();
    const u = req.user!;
    const now = d.now();
    await d.db.tx(async (q) => {
      const count = (await q.query<{ n: number }>("SELECT count(*)::int AS n FROM payment_cards WHERE user_id = $1", [u.id])).rows[0].n;
      if (count >= MAX_CARDS) throw new HttpError(400, `You can keep up to ${MAX_CARDS} cards. Remove one to add another.`);
      const m = await claim(q, str(req.body?.token), u.id, "card", now);
      const primary = count === 0 || req.body?.makePrimary === true;
      if (primary) await q.query("UPDATE payment_cards SET is_primary = false WHERE user_id = $1 AND is_primary", [u.id]);
      await q.query(
        "INSERT INTO payment_cards (user_id, vault_token, holder_name, brand, funding, last4, exp_month, exp_year, is_primary, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        [u.id, str(req.body?.token), m.holderName, m.brand, m.funding, m.last4, m.expMonth, m.expYear, primary, now]);
      await audit(q, { action: "card.added", actor: u.id, detail: { brand: m.brandLabel, last4: m.last4, primary }, at: now });
    });
    res.status(201).json(await paymentMethods(d.db, u.id));
  }));

  r.post("/cards/:id/primary", route(async (req, res) => {
    const u = req.user!;
    const now = d.now();
    await d.db.tx(async (q) => {
      const c = (await q.query<{ id: string; brand: Brand; last4: string }>("SELECT id, brand, last4 FROM payment_cards WHERE id::text = $1 AND user_id = $2", [req.params.id, u.id])).rows[0];
      if (!c) throw new HttpError(404, "Card not found.");
      await q.query("UPDATE payment_cards SET is_primary = false WHERE user_id = $1 AND is_primary", [u.id]);
      await q.query("UPDATE payment_cards SET is_primary = true WHERE id = $1", [c.id]);
      await audit(q, { action: "card.primary", actor: u.id, detail: { brand: BRAND_LABEL[c.brand], last4: String(c.last4) }, at: now });
    });
    res.json(await paymentMethods(d.db, u.id));
  }));

  r.delete("/cards/:id", route(async (req, res) => {
    const u = req.user!;
    const now = d.now();
    let promoted: { brand: Brand; last4: string } | undefined;
    await d.db.tx(async (q) => {
      const c = (await q.query<{ id: string; vault_token: string; brand: Brand; last4: string; is_primary: boolean }>(
        "SELECT id, vault_token, brand, last4, is_primary FROM payment_cards WHERE id::text = $1 AND user_id = $2", [req.params.id, u.id])).rows[0];
      if (!c) throw new HttpError(404, "Card not found.");
      await q.query("DELETE FROM payment_cards WHERE id = $1", [c.id]);
      await q.query("UPDATE vault_tokens SET revoked_at = $2 WHERE token = $1", [c.vault_token, now]);
      await audit(q, { action: "card.removed", actor: u.id, detail: { brand: BRAND_LABEL[c.brand], last4: String(c.last4) }, at: now });
      if (c.is_primary) {
        const next = (await q.query<{ id: string; brand: Brand; last4: string }>("SELECT id, brand, last4 FROM payment_cards WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1", [u.id])).rows[0];
        if (next) {
          await q.query("UPDATE payment_cards SET is_primary = true WHERE id = $1", [next.id]);
          await audit(q, { action: "card.primary", actor: u.id, detail: { brand: BRAND_LABEL[next.brand], last4: String(next.last4) }, at: now });
          promoted = { brand: next.brand, last4: String(next.last4) };
        }
      }
    });
    res.json({ ...(await paymentMethods(d.db, u.id)), promoted: promoted ? { brandLabel: BRAND_LABEL[promoted.brand], last4: promoted.last4 } : null });
  }));

  r.delete("/bank-account", (_req, _res, next) => next(new HttpError(409, "A legal guardian always needs a bank account on file. Add a new one to replace it.")));

  return r;
}

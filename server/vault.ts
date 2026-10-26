// Simulated payment vault (CC-186, CC-187, CC-182).
//
// Stands in for Stripe in development, test and staging. Like Stripe, it
// takes the full bank or card number, checks it and returns a token plus
// display details (brand, last four). Unlike a real vault it keeps nothing
// sensitive at all: the full numbers and the security code are discarded
// immediately — only the token and last four digits are kept. It accepts
// only published test values, and it does not exist in production.

import { Router } from "express";
import { BRAND_LABEL, checkBank, checkCard, TEST_CARDS, type BankInput, type CardInput } from "../src/lib/validation";
import { audit } from "./audit";
import { requireUser, type Deps } from "./auth";
import { randomToken } from "./crypto";
import { HttpError, rateLimit, route, str } from "./http";

export function vaultRouter(d: Deps): Router {
  const r = Router();
  r.use(requireUser, rateLimit({ windowMs: 600_000, max: 30, key: (req) => req.user?.id ?? req.ip ?? "?" }));
  r.use((req, _res, next) => (req.user!.role === "guardian" ? next() : next(new HttpError(403, "Only the legal guardian adds payment methods."))));

  r.post("/bank-accounts", route(async (req, res) => {
    const b = req.body ?? {};
    const input: BankInput = { bankName: str(b.bankName), holderName: str(b.holderName), routingNumber: str(b.routingNumber), accountNumber: str(b.accountNumber), accountType: str(b.accountType) };
    const { errors } = checkBank(input, true);
    const first = Object.keys(errors)[0] as keyof BankInput | undefined;
    if (first) {
      if (/test environment/.test(errors[first]!)) await audit(d.db, { action: "nonprod.blocked", actor: req.user!.id, detail: { field: first }, at: d.now() });
      throw new HttpError(400, errors[first]!, first, errors as Record<string, string>);
    }
    const account = input.accountNumber.replace(/\D/g, "");
    const routing = input.routingNumber.replace(/\D/g, "");
    const token = `ba_test_${randomToken(18)}`;
    const meta = { bankName: input.bankName.trim(), holderName: input.holderName.trim(), accountType: input.accountType, accountLast4: account.slice(-4), routingLast4: routing.slice(-4) };
    await d.db.query("INSERT INTO vault_tokens (token, kind, owner_user_id, metadata, created_at) VALUES ($1, 'bank_account', $2, $3::jsonb, $4)", [token, req.user!.id, JSON.stringify(meta), d.now()]);
    res.status(201).json({ token, ...meta });
  }));

  r.post("/cards", route(async (req, res) => {
    const b = req.body ?? {};
    const input: CardInput = { holderName: str(b.holderName), number: str(b.number), expMonth: Number(b.expMonth), expYear: Number(b.expYear), cvc: str(b.cvc), postalCode: str(b.postalCode) };
    const { errors, brand } = checkCard(input, true, d.now());
    const first = Object.keys(errors)[0] as keyof CardInput | undefined;
    if (first) {
      if (/test environment/.test(errors[first]!)) await audit(d.db, { action: "nonprod.blocked", actor: req.user!.id, detail: { field: "card" }, at: d.now() });
      throw new HttpError(400, errors[first]!, first, errors as Record<string, string>);
    }
    const pan = input.number.replace(/\D/g, "");
    const test = TEST_CARDS[pan];
    const token = `card_test_${randomToken(18)}`;
    const year = input.expYear < 100 ? 2000 + input.expYear : input.expYear;
    const meta = { holderName: input.holderName.trim(), brand, brandLabel: BRAND_LABEL[brand], funding: test?.funding ?? "unknown", last4: pan.slice(-4), expMonth: input.expMonth, expYear: year };
    // The full number and CVC go out of scope here and are never stored.
    await d.db.query("INSERT INTO vault_tokens (token, kind, owner_user_id, metadata, created_at) VALUES ($1, 'card', $2, $3::jsonb, $4)", [token, req.user!.id, JSON.stringify(meta), d.now()]);
    res.status(201).json({ token, ...meta });
  }));

  return r;
}

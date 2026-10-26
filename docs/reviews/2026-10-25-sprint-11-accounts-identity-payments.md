# Code review — Sprint 11: Accounts, Identity & Payments (CC-172 – CC-190)

| | |
|---|---|
| Branch | `feature/accounts-identity-payments` → `main` |
| Commits reviewed | `e8ef366` (feature), `bc2a6f6` (review fixes) |
| Approver | **Lead Architect Agent** (independent AI review agent) |
| Developer · Tester · Build & Deploy | Dev Agent · QA Agent · Release Agent |
| Product Owner | Sumanth (PO) |
| Date | 2026-10-25 |
| Final verdict | **APPROVED** (after one round of changes) |

## Round 1 — APPROVED WITH CHANGES

The reviewer confirmed these were sound: parameterised SQL with allow-listed columns, every payment query scoped to the user, vault tokens owned/single-use/expiring, the CSRF header plus a SameSite=Strict cookie, the service worker skipping the API, and production start-up guards.

| # | Finding | Fix | Regression test |
|---|---|---|---|
| M1 | Parallel wrong passwords could skip the lockout (read-then-write counter) | `recordFailure()` uses one atomic `UPDATE … RETURNING`; the lock is set when the count reaches 5 | 20 concurrent wrong passwords → locked |
| M2 | The password step for changing an SSN allowed unlimited guesses | Failures count toward the same lockout; a lock deletes every session and returns 429 | 5 wrong → 429, sessions ended |
| M3 | Non-prod accepted real ITINs (9XX-70-…) as "test SSNs" | Non-prod rejects 9XX groups 50–65, 70–88, 90–92, 94–99 | 4 rejected, 4 accepted |
| M4 | A bank name containing 9+ digits caused a 500 (audit guard) | Field validation rejects long digit runs; bank name removed from the audit detail | Field error on `bankName` |

Follow-ups also done: staging requires `DATABASE_URL`; `Secure` cookie in staging; Postgres unique violation (23505) → 409; malformed cookie ignored; live Stripe key refused outside production.

## Round 2 — APPROVED

All four fixes and the follow-ups were confirmed by reading the code and re-running the reviewer's race scripts: 20 parallel guesses → `failed_attempts=20`, locked, correct password refused. Both TypeScript configs compile. 312 tests pass.

## Carried forward (not blocking)

- Production go-live needs the Stripe adapter (Stripe Elements for cards, Financial Connections or micro-deposits for the mandatory bank account).
- Identity verification with a third-party provider; MFA, password reset and email verification for real accounts.
- Shared rate-limit store for multi-instance production; "sign out everywhere" and rotating the session after sensitive changes.
- Product decision: "mandatory" SSN and bank account are currently shown as *Incomplete* rather than blocking other actions.

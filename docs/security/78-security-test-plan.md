# Security Test Plan

Notion story: CC-78 Security testing and penetration test
Status: IN PROGRESS — internal checks done on the browser prototype (see §3). **External pen test not yet commissioned.** No production system exists to test yet.

## 1. Scope

| In scope (production, when built) | In scope (now, prototype) | Out of scope |
|---|---|---|
| Elder/caregiver/guardian clients (PWA, later native) | React prototype, production build in `dist/` | Vendor infrastructure (covered by their reports) |
| API and policy engine (CC-19) | Data-layer policy (`src/data/policy.ts`) | Physical security |
| Auth, MFA, sessions (CC-12, CC-14, CC-27) | Device encryption, export, uploads (`src/lib/secureStorage.ts`) | Social engineering of staff (separate exercise) |
| Database, object storage, audit log (CC-28) | Audit chain (`src/data/audit.ts`) | |
| Notification pipeline (CC-31) | Alert titles | |
| Review console (CC-24) | `/app/review` | |

## 2. Standards and checklist highlights

Target: **OWASP ASVS Level 2** for web/API and **OWASP MASVS** (L1 + R where relevant) for mobile clients. Highlights most relevant to Circle Care:

| Area | ASVS / MASVS focus | Circle Care specifics |
|---|---|---|
| Authentication | ASVS V2: MFA, lockout, credential recovery | MFA for guardian and caregiver; lockout after 5 codes for 15 min (CC-12); passkeys/biometric for elder |
| Session | ASVS V3: timeout, revocation | Inactivity lock (15 min default), Sign out everywhere revokes server sessions and push tokens (CC-27) |
| Access control | ASVS V4: deny by default, server-side, IDOR | Every resource × action from the permission matrix tested at the API; `pro@shift` based on server check-in; IDOR across circles |
| Validation | ASVS V5 | Upload signature checks + malware scan (CC-67); free-text fields rendered safely |
| Cryptography | ASVS V6, MASVS-CRYPTO | AES-256-GCM, unique IVs, managed keys; PBKDF2 iteration count for exports reviewed against current guidance |
| Error handling / logging | ASVS V7 | No PHI in logs or error reports; audit chain integrity |
| Data protection | ASVS V8, MASVS-STORAGE | No PHI in notifications, URLs, browser history, caches, screenshots in app switcher (native) |
| Communications | ASVS V9, MASVS-NETWORK | TLS 1.2+, HSTS, certificate pinning decision for native |
| Files | ASVS V12 | Size limit 10 MB, type allowlist, signed URLs, watermarking |
| API | ASVS V13 | Rate limits, schema validation |
| Configuration | ASVS V14 | CSP as HTTP header incl. `frame-ancestors`, dependency scanning |
| Mobile platform | MASVS-PLATFORM | Push payloads PHI-free; deep links validated (invite links) |
| Privacy | MASVS-PRIVACY | No tracking SDKs; analytics PHI-free |

## 3. Already done in this repository (prototype)

| Check | Result | Evidence | Limits |
|---|---|---|---|
| Content Security Policy | Added to production builds via a Vite plugin that injects a `<meta>` CSP and `no-referrer` (`vite.config.ts`): `default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `connect-src 'self'` | `vite.config.ts` | Meta CSP cannot set `frame-ancestors`, so anti-framing needs an HTTP header (code comment corrected). `style-src 'unsafe-inline'` remains |
| Dependency audit | `npm audit` reported **0 vulnerabilities** on 2026-10-19 | Command output, re-run during this doc's preparation | Point-in-time; add to CI |
| Unit tests | `vitest` — **180 tests passed** in 4 files (policy, rules, audit, sha256) on 2026-10-19 | `npm test` | Tests the client data layer, not a server |
| Permission matrix tests | One test per resource × action × role, plus pro on/off shift, revoked users, pause sharing, reviewer | `src/__tests__/policy.test.ts` | Some store actions are not routed through `can()` — see permission matrix "Coverage gaps" |
| Audit chain tests | Tamper, reorder and removal detection | `src/__tests__/audit.test.ts` | Client-side only |
| Accessibility audit | axe-core WCAG 2.1 A/AA audit of 22 screens: 0 violations (2026-10-19, after contrast fixes) | `tests/e2e/a11y.py` | Manual VoiceOver/TalkBack pass still needed |
| End-to-end tests | 25 Playwright scenarios, all passing against the production build (2026-10-19) | `tests/e2e/e2e.py` (Python Playwright; see `tests/e2e/README.md`) | Not yet wired into CI |

## 4. Planned internal testing (before pen test)

- [ ] SAST in CI (e.g., semgrep/CodeQL) and `npm audit` on every PR.
- [ ] Secret scanning in the repo.
- [ ] API authorization test suite generated from `MATRIX` (same approach as `policy.test.ts`, against the API).
- [ ] PHI-leak tests: seed fake PHI and assert it never appears in push payloads, SMS bodies, email, logs, error reports, URLs.
- [ ] DAST against staging (e.g., OWASP ZAP baseline).
- [ ] Commit axe-core and Playwright suites; manual screen reader pass.

## 5. External penetration test — vendor selection criteria

| Criterion | Weight | Notes |
|---|---|---|
| Healthcare / HIPAA experience | High | References from health apps |
| Mobile + web + API in one engagement | High | |
| Tester credentials (e.g., OSCP, OSWE, GWAPT, GMOB) | Medium | Named testers, not just company |
| Methodology mapped to ASVS/MASVS | High | |
| Willing to sign a BAA if testing touches PHI (prefer synthetic data only) | High | Test with fictional data like the demo |
| Retest included | High | At least one free retest of findings |
| Report quality | Medium | Ask for a redacted sample |
| Cost and timeline | Medium | Must finish before pilot readiness gate (CC-74 §9) |

### RFP outline

1. Company background and product summary (link CC-10 threat model).
2. Scope: environments, URLs, apps, API docs, test accounts per role (elder, guardian, family, pro, reviewer), out-of-scope items.
3. Objectives: authorization bypass across circles and roles, `pro@shift` bypass, session/MFA weaknesses, PHI leakage via notifications/logs, document upload abuse, audit tampering, review console isolation.
4. Rules of engagement: testing windows, no DoS on SOS paths without coordination, synthetic data only, emergency contact.
5. Deliverables: executive summary, findings with CVSS and reproduction steps, ASVS/MASVS mapping, retest report.
6. Vendor questions: team, credentials, sample report, insurance, BAA willingness, price, schedule.
7. Evaluation criteria (§5) and timeline.

## 6. Remediation SLAs

| Severity (CVSS 3.1 / vendor rating) | Fix by | Pilot impact |
|---|---|---|
| Critical (9.0–10.0) | 7 days; hotfix | Blocks pilot start / pauses pilot |
| High (7.0–8.9) | 30 days | Blocks pilot start |
| Medium (4.0–6.9) | 90 days | Track; risk-accept with owner sign-off |
| Low (0.1–3.9) | Next planned release / 180 days | Track |
| Informational | Backlog | — |

Any finding that exposes PHI across circles is treated as Critical regardless of score. Risk acceptance requires the security officer's written sign-off and is recorded in CC-79.

## 7. Human actions

- [ ] Commission the external pen test once a staging environment exists (not yet commissioned).
- [ ] Commit axe-core and Playwright test files.
- [ ] Add CSP as an HTTP header with `frame-ancestors 'none'`.
- [ ] Add CI security checks.

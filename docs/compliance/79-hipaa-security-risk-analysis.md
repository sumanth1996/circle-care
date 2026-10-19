# HIPAA Security Risk Analysis

Notion story: CC-79 HIPAA security risk analysis
Status: Draft — requires review by a designated security officer. No security officer has been designated yet. Prepared by the product owner on 2026-10-19 against the planned MVP; the prototype holds fictional data only. Not legal advice. Structure follows the HHS Security Risk Assessment (SRA) approach: scope → assets → threats/vulnerabilities → current controls → likelihood × impact → risk rating → treatment.

## 1. Scope

- **ePHI in scope:** all circle data classified PHI in CC-9 (medications, doses, tasks, visits, hand-offs, notes, documents, SOS events, check-ins, emergency card, approvals with med changes, alert details).
- **Systems:** client apps, API/policy engine, auth/MFA, database, object storage, rules/escalation worker, notification providers, review console, backups, staff laptops, pilot research store (should hold no ePHI — verify).
- **People:** engineering, support, review team, pilot team.
- **Applicability:** HIPAA applies directly only in business-associate scenarios (CC-8). This analysis is done for all circles as the design standard.

## 2. Asset inventory

Data assets: see [CC-9 data inventory](09-data-inventory.md). System assets:

| Asset ID | Asset | Holds ePHI | Owner |
|---|---|---|---|
| A1 | Client apps (elder, caregiver, guardian) | Yes (cached, encrypted) | TBD |
| A2 | API + policy engine | Yes (in transit/processing) | TBD |
| A3 | Auth / MFA service | No (identities, credentials) | TBD |
| A4 | Database incl. audit chain | Yes | TBD |
| A5 | Object storage (documents) | Yes | TBD |
| A6 | Rules / escalation worker | Yes | TBD |
| A7 | Push, SMS, email vendors | Designed PHI-free; SMS/email metadata possible (CC-30) | TBD |
| A8 | Review console | Legal documents | TBD |
| A9 | Backups | Yes | TBD |
| A10 | Logs / error monitoring | Must be PHI-free | TBD |
| A11 | Staff endpoints | Possibly (support) | TBD |
| A12 | Pilot research store | No (verify) | TBD |

## 3. Scoring method

- **Likelihood:** 1 Rare · 2 Unlikely · 3 Possible · 4 Likely · 5 Almost certain
- **Impact:** 1 Negligible · 2 Minor (one circle, low sensitivity) · 3 Moderate (one circle, PHI exposed or safety feature delayed) · 4 Major (many circles, or harm to an elder) · 5 Severe (platform-wide exposure or safety failure)
- **Risk = L × I:** 1–4 Low · 5–9 Medium · 10–16 High · 20–25 Critical
- Scores are **inherent with planned controls** (production design) and are preliminary estimates by the product owner, not measured.

## 4. Risk register

| ID | Threat / vulnerability | Assets | Current controls (prototype = P, planned = Pl) | L | I | Risk | Treatment | Owner |
|---|---|---|---|---|---|---|---|---|
| R1 | Authorization bypass: client calls API for data the role shouldn't see | A2, A4 | P: `can()` in data layer + 180 passing tests; Pl: server-side policy (CC-19) | 3 | 5 | 15 High | Build API enforcement from same matrix; generated API authz tests; coverage gaps closed in prototype | TBD |
| R2 | Caregiver accesses records off shift | A2 | P: `pro@shift` rule, tested; Pl: server check-in times | 2 | 3 | 6 Med | Server-side shift state; alert on off-shift attempts | TBD |
| R3 | Account takeover of guardian | A3 | P: demo MFA, lockout after 5 codes; Pl: TOTP/passkeys, rate limits | 3 | 4 | 12 High | Phishing-resistant MFA for guardians; new-device alerts | TBD |
| R4 | Lost/stolen device with open session | A1 | P: AES-GCM device encryption, non-extractable key, inactivity lock, Sign out everywhere (state only) | 4 | 3 | 12 High | Server session revocation; remote wipe of cached data on next contact | TBD |
| R5 | PHI in notifications (lock screen, SMS, email) | A7 | P: PHI-free alert titles by rule (CC-31); digest email PHI-free | 2 | 3 | 6 Med | Automated PHI-leak tests on payloads | TBD |
| R6 | PHI in logs / error monitoring | A10 | None yet | 4 | 3 | 12 High | Scrubbing, field allowlists, tests with seeded fake PHI | TBD |
| R7 | Malicious document upload | A5 | P: signature check (PDF/PNG/JPEG), 10 MB limit; Pl: malware scan | 3 | 3 | 9 Med | Server-side scanning, sandboxed rendering | TBD |
| R8 | Insider (staff) browses circles | A4, A8 | P: reviewer limited to legal docs; audit chain | 2 | 4 | 8 Med | No standing admin access; break-glass with logging and review | TBD |
| R9 | Audit log tampering | A4 | P: hash chain with `verifyChain()`, tests | 2 | 3 | 6 Med | Append-only storage; periodic external anchoring | TBD |
| R10 | Forged guardian documents grant authority | A8 | P: review queue with rejection reasons (CC-24) | 3 | 4 | 12 High | Reviewer training and checklist; identity verification; counsel on liability (CC-8 Q11) | TBD |
| R11 | Vendor breach (SMS/email/cloud) | A7, A4 | None — no vendors yet | 2 | 4 | 8 Med | BAAs and security reviews (CC-30) | TBD |
| R12 | SOS / escalation not delivered (availability) | A6, A7 | P: escalation chain, SMS fallback design | 3 | 5 | 15 High | Multi-channel delivery, monitoring and alerting, critical-alert entitlements; clear "call 911" guidance | TBD |
| R13 | Data loss (no backups / failed restore) | A4, A5, A9 | None yet | 2 | 4 | 8 Med | Encrypted backups, restore tests quarterly; contingency plan | TBD |
| R14 | Leaked export file | A1 | P: passphrase encryption PBKDF2 250k + AES-GCM; export logged | 2 | 3 | 6 Med | Re-auth before export; passphrase strength meter | TBD |
| R15 | XSS / injected script | A1 | P: CSP on production build (meta tag) | 2 | 4 | 8 Med | CSP as header incl. `frame-ancestors`; remove `'unsafe-inline'` styles if feasible | TBD |
| R16 | Over-collection in free text (notes, reasons) | A4 | P: notes visibility choice | 4 | 2 | 8 Med | Guidance in UI; retention limits | TBD |
| R17 | Re-identification from pilot data | A12 | P: separate store, minimal fields, `scrubHealth`, cohort < 5 hidden | 2 | 2 | 4 Low | Review comments before quoting; delete at 12 months | TBD |
| R18 | Workforce untrained on HIPAA | A11 | None | 3 | 3 | 9 Med | Training at hire and yearly; sanctions policy | TBD |
| R19 | Third-party asset requests leak usage (fonts/images CDNs) | A1 | `no-referrer` | 3 | 1 | 3 Low | Self-host fonts and images | TBD |

## 5. Administrative, physical and technical safeguards — gap summary

| Safeguard (Security Rule) | Status |
|---|---|
| Security management process (risk analysis, risk management, sanctions, activity review) | This draft only |
| Assigned security responsibility | **Not assigned** |
| Workforce security / training | Not started |
| Information access management | Matrix defined and tested in prototype |
| Security incident procedures | Draft runbook (CC-34), not exercised |
| Contingency plan (backup, DR, emergency mode) | Not started |
| Evaluation | Pen test not commissioned (CC-78) |
| Business associate contracts | Register template only (CC-30) |
| Facility / workstation / device controls | Not started (staff laptops: disk encryption, MDM) |
| Access control (unique IDs, emergency access, auto logoff, encryption) | Demo: unique member IDs, auto lock, encryption on device |
| Audit controls | Demo: hash-chained audit log |
| Integrity | Demo: GCM authentication, audit chain |
| Person or entity authentication | Demo MFA only |
| Transmission security | Planned TLS; no backend yet |

## 6. Treatment plan priorities

1. **Before pilot (CC-74 gate):** R1, R3, R4, R6, R10, R12 to Medium or lower; R11 BAAs signed; contingency plan; security officer designated.
2. **Within pilot:** R7, R8, R13, R15, R18.
3. **Ongoing:** re-run this analysis yearly and on major changes (new integration, new vendor, architecture change).

## 7. Sign-off

| Role | Name | Date | Signature |
|---|---|---|---|
| Security officer | Not designated | — | — |
| Privacy officer | Not designated | — | — |
| Product owner | Sumanth (draft author) | 2026-10-19 | Draft only |

# Vendor and BAA Register

Notion story: CC-30 Vendor BAA register
Status: TEMPLATE — no vendors selected, no contracts or BAAs signed. Every row needs an owner. Not legal advice; BAA requirements to be confirmed by counsel (CC-8).

## Rules for this register

1. **Default to PHI-free.** For every vendor, first ask: can we design so this vendor never receives PHI? If yes, document the design control and verify it in testing. If no, a signed BAA is required **before** any production data flows.
2. A BAA is necessary but not sufficient: also review the vendor's security posture (SOC 2 Type II / HITRUST report, encryption, breach notice terms, subprocessors, data location, deletion on termination).
3. Free tiers and consumer plans of most vendors do **not** include BAAs. Confirm the specific plan.
4. Even where HIPAA does not apply (consumer mode), keep the same controls; the FTC Health Breach Notification Rule and state laws treat unauthorized sharing as a breach.
5. Review each row at least yearly and whenever the vendor's use changes.

## Register

| # | Vendor (TBD) | Purpose | PHI? | BAA required | BAA status | Design control / notes | Owner | Review date |
|---|---|---|---|---|---|---|---|---|
| 1 | Cloud hosting (compute, networking) | Runs API, rules/escalation worker | Yes | Yes | Not started — needs owner | Use only HIPAA-eligible services listed under the provider's BAA | TBD | TBD |
| 2 | Managed database | Circle data, audit chain | Yes | Yes (usually covered by cloud BAA — confirm) | Not started — needs owner | Encryption at rest with managed keys; append-only audit table | TBD | TBD |
| 3 | Object storage | Care documents, legal documents | Yes | Yes (usually covered by cloud BAA — confirm) | Not started — needs owner | Private buckets, signed short-lived URLs, malware scan before storage (CC-67) | TBD | TBD |
| 4 | Key management | Encryption keys | No PHI (keys only) — but critical | Covered under cloud BAA — confirm | Not started — needs owner | Rotation policy; access logged | TBD | TBD |
| 5 | Apple Push Notification service (APNs) | iOS push | **No — by design** | No (PHI-free) | Not started — needs owner | Payload contains only generic title ("You have a reminder from Circle Care") and an opaque ID (CC-31). Critical-alert entitlement needed for SOS | TBD | TBD |
| 6 | Firebase Cloud Messaging (FCM) | Android / web push | **No — by design** | No (PHI-free) | Not started — needs owner | Same as APNs; verify no analytics SDK is bundled | TBD | TBD |
| 7 | SMS provider | Reminders, SOS fallback, MFA codes | Possible (phone number + fact of care relationship) | **Likely yes** — confirm with counsel | Not started — needs owner | Message bodies PHI-free; 10DLC registration; STOP/HELP; consent records (TCPA, CC-8 §6) | TBD | TBD |
| 8 | Email provider | Weekly digest, invites, security notices | Possible (recipient + relationship) | **Likely yes** — confirm | Not started — needs owner | Digest email version carries no PHI (CC-83); disable open/click tracking | TBD | TBD |
| 9 | Error monitoring | Crash and error reports | **Must be PHI-free** | Yes if PHI cannot be ruled out | Not started — needs owner | Scrub request bodies, URLs and user fields before send; allowlist of fields; test with seeded fake PHI | TBD | TBD |
| 10 | Product analytics | Usage metrics | **Must be PHI-free** | Avoid needing one | Not started — needs owner | Prefer self-hosted, aggregate-only; no session replay; no third-party ad SDKs; promise on `/privacy`: "never use analytics that can identify a person" | TBD | TBD |
| 11 | Identity / document verification | Verify guardian identity and legal documents (CC-24) | Yes (legal docs, ID) | Yes | Not started — needs owner | Evaluate whether needed vs. internal review | TBD | TBD |
| 12 | Malware scanning | Scan uploads | Yes (file contents) | Yes, unless run inside our cloud account | Not started — needs owner | Prefer in-account scanning | TBD | TBD |
| 13 | Customer support / helpdesk | Support tickets | Possible (users describe health issues) | Yes if used for circle support | Not started — needs owner | Form warns "don't include health details"; redact | TBD | TBD |
| 14 | Video / phone for setup calls (CC-75) | White-glove onboarding | Possible (screen sharing shows PHI) | Yes if PHI visible | Not started — needs owner | Use demo data during calls where possible; no recording | TBD | TBD |
| 15 | Research / survey tool | Pilot NPS, interviews | **Must be PHI-free** | Avoid needing one | Not started — needs owner | Keep separate from circle data (`src/lib/pilot.ts` pattern); de-identify | TBD | TBD |
| 16 | Static hosting / CDN (marketing site) | Public website | No | No | Not started — needs owner | Site has no forms that collect health info; pilot form says "don't include health information" | TBD | TBD |
| 17 | Fonts / images CDNs (Google Fonts, Unsplash) | Prototype assets | No — but leaks IP/referrer | No | Not started — needs owner | Self-host fonts and images in production to avoid third-party requests from inside the app; `referrer: no-referrer` already set | TBD | TBD |
| 18 | Replit (prototype hosting) | Hosts the demo | No — demo data only | No | n/a for production | Never put real data in the demo | TBD | TBD |

## PHI-free payload specification (rows 5, 6, 7, 8)

These are the design rules that let push providers stay outside a BAA and that minimize what SMS and email vendors see. They mirror the prototype's alert model (`Alert.title` is lock-screen text and must be generic; `Alert.detail` is shown only in the app after unlock — CC-31).

| Channel | Allowed in payload | Never in payload | Prototype example |
|---|---|---|---|
| Push (APNs/FCM) | Generic title, opaque alert ID, severity for critical-alert sound | Elder's name, medicine names, conditions, note text, document names | "You have a reminder from Circle Care" |
| Push — SOS | Generic emergency title, opaque SOS ID | Location, health details | "Emergency alert from Circle Care" |
| Push — security | Generic security title | Who accessed what | "Circle Care security notice" |
| SMS | Generic text + instruction to open the app; STOP/HELP | Same as push; no sign-in links that accept codes | — |
| Email digest | Counts and generic status ("All check-ins done this week") | Medicine names, notes, documents | Digest page notes "The email version carries no PHI" (CC-83) |
| Email invite | Inviter's first name, role being offered, expiring link | Elder's health information | — |

Open question: does the combination "phone number + receives Circle Care reminders" itself reveal a care relationship that makes the SMS vendor a business associate? Counsel to decide (CC-8).

### Verification tests to build

- Seed every PHI field in CC-9 with a unique marker string (e.g., `ZZ-PHI-0001`).
- Run each alert rule (missed dose, missed check-in, SOS, suspicious access, approval reminder).
- Capture outbound push, SMS and email payloads at the provider boundary and assert no marker appears.
- Run in CI on every change to alert rules or templates.

## Per-vendor checklist (copy for each)

- [ ] Vendor name and plan:
- [ ] Data categories sent (link to CC-9 rows):
- [ ] Can PHI be eliminated by design? How verified?
- [ ] BAA offered on this plan? Signed date:
- [ ] Security report reviewed (SOC 2 / HITRUST / ISO 27001) — date and scope:
- [ ] Breach notification terms (timeline to us):
- [ ] Subprocessors listed and acceptable:
- [ ] Data residency:
- [ ] Deletion on termination and timeline:
- [ ] Owner and next review date:

## Human actions

- [ ] Name an owner for every row.
- [ ] Counsel confirms which rows need a BAA (especially SMS and email).
- [ ] Engineering adds automated tests that fail if PHI fields reach rows 5, 6, 9, 10 or 15.

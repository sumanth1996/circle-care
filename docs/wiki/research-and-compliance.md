# Research & Compliance

Working drafts for the backlog stories that need real people, counsel or vendors to complete: user research, regulatory and data-protection analysis, security planning and the pilot plan. They live in `docs/research`, `docs/compliance`, `docs/security` and `docs/pilot` and are indexed for GitHub readers in `docs/README.md`.

!!! warning "Drafts — not legal advice"
    Status as of 2026-10-19: working drafts. Circle Care is a CSPO-training concept product; all people in the prototype are fictional. Nothing in these documents reports real interviews, signed contracts, legal review or completed external tests unless it says so explicitly. Compliance documents are **not legal advice**. Each document starts with its Notion story ID and lists the human action still needed.

## Index

| Story | Document | What it is | Needs human action |
|---|---|---|---|
| CC-1, CC-197 | [Recruiting screener](../research/01-recruiting-screener.md) | Recruiting channels, screener per persona, quotas, consent outline (how notes are kept and deleted), incentive, de-identification, tracker, human steps | Yes — recruit, review consent text, fund incentives |
| CC-2, CC-197 | [Interview guide — elders](../research/02-interview-guide-elders.md) | Elder interview guide with concept tests (including My day, chat and the evening recap) and hypotheses | Yes — pilot the guide, run 6+ interviews, safety protocol |
| CC-3, CC-197 | [Interview guide — caregivers](../research/03-interview-guide-caregivers.md) | Workload and verification, with concept tests of refills and the family chat | Yes — agency permissions, 6+ interviews |
| CC-4, CC-197 | [Interview guide — guardians](../research/04-interview-guide-guardians.md) | Verification, autonomy, authority, with concept tests of the evening recap, refills, check-ins and chat | Yes — 5+ interviews |
| CC-5 | [Journey maps](../research/05-journey-maps.md) | Hypothesis journeys per persona and synthesis process | Yes — replace hypotheses with evidence |
| CC-6 | [Opportunity solution tree](../research/06-opportunity-solution-tree.md) | North Star, opportunities, solutions, assumption tests | Yes — run assumption tests, re-rank |
| CC-7 | [Competitive teardown](../research/07-competitive-teardown.md) | Framework, comparison table, positioning gaps | Yes — verify every product fact |
| CC-1 | [Outreach kit](../research/08-outreach-kit.md) and [recruiting tracker](../research/09-recruiting-tracker.csv) | Recruiting timeline, outreach templates per channel, large-type flyer, phone script, ID-only tracker | Yes — name a recruiting owner and send the outreach |
| CC-2 to CC-4 | [Fieldwork plan](../research/10-fieldwork-plan.md) | Roles, session schedule (PT), run sheet, draft safety protocol for disclosures of harm, storage and deletion | Yes — moderator, note-taker, review the safety protocol |
| CC-5 | [Synthesis kit](../research/11-synthesis-kit.md) | What agents may receive, rolling saturation check, hypothesis scorecard, journey-map check script | Yes — run the 5 journey-map checks |
| CC-8, CC-196 | [Regulatory memo](../compliance/08-regulatory-memo.md) | HIPAA, FTC, state law, TCPA, ADA, guardianship applicability; v2 (2026-11-15) adds SSNs, bank accounts, cards, photos, chat and voice, check-ins, and 25 questions for counsel, checked against the data inventory by a unit test | Yes — counsel review (CC-8) |
| CC-9 | [Data inventory](../compliance/09-data-inventory.md) | Every state field and Postgres column classified, checked by a unit test; reviewed against `main` on 2026-11-15 | Yes — security officer and counsel sign-off |
| CC-10 | [Threat model](../security/10-threat-model.md) | STRIDE threat model of the built system, with each control traced to code | Yes — engineering security review and security officer |
| CC-18 | [Permission matrix](../security/permission-matrix.md) | Readable rendering of `MATRIX` | Partly — open design questions, server enforcement |
| CC-30 | [Vendor & BAA register](../compliance/30-vendor-baa-register.md) | Vendor and BAA register template | Yes — pick vendors, sign BAAs |
| CC-34 | [Incident response runbook](../security/34-incident-response-runbook.md) | Severity levels, roles, playbooks, notification table, tabletop | Yes — assign roles, confirm timelines, tabletop |
| CC-74 | [Pilot plan](../pilot/74-pilot-plan.md) | 15–25 circles, 8 weeks, metrics, exit criteria | Yes — readiness gate, recruit, budget |
| CC-78 | [Security test plan](../security/78-security-test-plan.md) | ASVS L2 / MASVS plan, pen-test RFP, SLAs | Yes — commission external pen test |
| CC-79 | [HIPAA security risk analysis](../compliance/79-hipaa-security-risk-analysis.md) | HHS-style risk analysis with scored register | Yes — designate a security officer |

## Open findings {#open-findings}

Findings that came from reading the code while writing these documents and this wiki. They are candidates for backlog stories.

| # | Finding | Status | Where discussed |
|---|---|---|---|
| 1 | Several store actions bypassed the permission check | **Fixed** Oct 19, 2026 (new `handoffs` resource, actor checks) | [Permission matrix — coverage gaps](../security/permission-matrix.md#coverage-gaps-prototype) |
| 2 | The elder cannot read guardian-only notes (`notes.private`), nor hand-offs; the Notes hint says she can | Open — product decision | [Notes & documents](features/notes-and-documents.md) |
| 3 | A `<meta>` CSP cannot block framing; clickjacking protection needs an HTTP header | Open — production | [Security & privacy](architecture/security-and-privacy.md#content-security-policy) |
| 4 | No committed axe-core or Playwright scripts | **Fixed** — 29 scenarios, 24 screens | [Quality & testing](architecture/quality-and-testing.md) |
| 5 | The `/pilot` form collects name and contact but discards them; production needs a separate, deletable contact store | Open | [Pilot & feedback](features/pilot-and-feedback.md) |
| 6 | An unverified guardian is not downgraded to family access, although the Care circle page says so | Open | [Care circle & access](features/care-circle-and-access.md#known-limitations-production-gaps) |
| 7 | The guardian has no way to remove a member, although the suspicious-access alert tells her to do so in Care circle | Open | [Care circle & access](features/care-circle-and-access.md#known-limitations-production-gaps) |
| 8 | The elder and caregiver apps have no calendar screen, although the appointment form says Maggie sees every appointment | Open | [Care calendar](features/care-calendar.md#known-limitations-production-gaps) |
| 9 | Closing a circle in the prototype also discards the access log, although the UI says it is kept six years | Open — production design | [Privacy Center](features/privacy-center.md#known-limitations-production-gaps) |
| 10 | Maggie's age shows as 81 (website, emergency card) and 80 (birth year 1946, Health); SOS responder shows a non-San Francisco demo address | Fixed in v0.4 | [Release notes v0.4](product/release-notes.md#v04-california-localisation-and-documentation) |
| 11 | `docs/security/permission-matrix.md` lacks the `handoffs`, `vitals` and `appointments` rows and still cites 180 tests | Open — regenerate the doc | [Security & privacy](architecture/security-and-privacy.md#summary-matrix) |

## Conventions

- Story IDs match the Notion backlog (`CC-n`).
- Hypotheses are labelled H-E (elder), H-C (caregiver), H-G (guardian).
- "Demo" = demonstrated in the browser prototype with fictional data; "Prod" = production work not yet built.

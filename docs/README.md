# Circle Care — Product and Compliance Working Docs

Notion story: none — index of the docs for CC-1 through CC-79 below
Status: Working drafts as of 2026-10-19. Circle Care is a CSPO-training concept product; all people in the prototype are fictional. Nothing in these docs reports real interviews, signed contracts, legal review or completed external tests unless it says so explicitly. Compliance documents are **not legal advice**.

Each doc starts with its Notion story ID so it can be linked from the Circle Care Product Hub backlog.

## Index

| Story | Doc | What it is | Needs human action |
|---|---|---|---|
| CC-1 | [research/01-recruiting-screener.md](research/01-recruiting-screener.md) | Recruiting channels, screener per persona, quotas, consent outline, incentive, de-identification, tracker | Yes — recruit, get consent text reviewed, fund incentives |
| CC-2 | [research/02-interview-guide-elders.md](research/02-interview-guide-elders.md) | Elder interview guide with prototype concept test and hypotheses | Yes — pilot the guide, run 6+ interviews, write safety protocol |
| CC-3 | [research/03-interview-guide-caregivers.md](research/03-interview-guide-caregivers.md) | Caregiver interview guide (workload, verification) | Yes — get agency permissions, run 6+ interviews |
| CC-4 | [research/04-interview-guide-guardians.md](research/04-interview-guide-guardians.md) | Guardian interview guide (verification, autonomy, authority) | Yes — run 5+ interviews |
| CC-5 | [research/05-journey-maps.md](research/05-journey-maps.md) | Hypothesis journeys per persona + affinity-mapping synthesis process | Yes — replace hypotheses with evidence after interviews |
| CC-6 | [research/06-opportunity-solution-tree.md](research/06-opportunity-solution-tree.md) | North Star, opportunities, solutions, assumption tests (mermaid) | Yes — run assumption tests, re-rank after research |
| CC-7 | [research/07-competitive-teardown.md](research/07-competitive-teardown.md) | Teardown framework, comparison table, positioning gaps | Yes — verify every product fact before publishing |
| CC-8 | [compliance/08-regulatory-memo.md](compliance/08-regulatory-memo.md) | HIPAA / FTC / state law / TCPA / ADA / guardianship applicability | Yes — counsel review; answer Q1–Q13 |
| CC-9 | [compliance/09-data-inventory.md](compliance/09-data-inventory.md) | Every data element in `types.ts` + pilot store, classified | Yes — security officer and counsel sign-off on classes and retention |
| CC-10 | [security/10-threat-model.md](security/10-threat-model.md) | STRIDE threat model with DFD; prototype vs. production | Yes — engineering security review once architecture is chosen |
| CC-18 | [security/permission-matrix.md](security/permission-matrix.md) | Readable rendering of `MATRIX` in `src/data/policy.ts` | Partly — decide open design questions; close coverage gaps; build server-side enforcement |
| CC-30 | [compliance/30-vendor-baa-register.md](compliance/30-vendor-baa-register.md) | Vendor and BAA register template | Yes — pick vendors, assign owners, sign BAAs |
| CC-34 | [security/34-incident-response-runbook.md](security/34-incident-response-runbook.md) | Severity levels, roles, playbooks, notification table, tabletop script | Yes — assign roles, confirm timelines with counsel, run tabletop |
| CC-74 | [pilot/74-pilot-plan.md](pilot/74-pilot-plan.md) | 15–25 circle, 8-week pilot plan with metrics and exit criteria | Yes — pass readiness gate, recruit, budget |
| CC-78 | [security/78-security-test-plan.md](security/78-security-test-plan.md) | ASVS L2 / MASVS plan, what's done, pen test RFP, SLAs | Yes — commission external pen test; commit axe and Playwright suites |
| CC-79 | [compliance/79-hipaa-security-risk-analysis.md](compliance/79-hipaa-security-risk-analysis.md) | HHS-style risk analysis with scored register | Yes — designate a security officer to review and own |

## Findings from writing these docs (worth a backlog story)

These came from reading the code, not from research:

1. ~~Several store actions bypassed the permission check.~~ **Fixed Oct 19, 2026:** every data-changing action is now checked (a new `handoffs` resource covers hand-offs; elder-only and member-specific actions check the actor). See [permission matrix](security/permission-matrix.md#coverage-gaps-prototype).
2. The elder cannot read guardian-only notes (`notes.private`), which conflicts with "her data, her decision" and may conflict with a right of access.
3. The CSP is a `<meta>` tag, so it can't block framing; clickjacking protection needs an HTTP header from the host (the misleading `vite.config.ts` comment has been corrected).
4. ~~No committed axe-core or Playwright scripts.~~ **Fixed:** `tests/e2e/e2e.py` (25 scenarios) and `tests/e2e/a11y.py` (22 screens) are committed; see `tests/e2e/README.md`.
5. The `/pilot` form collects name and contact but the prototype discards them; production needs a separate, deletable contact store.

## Conventions

- Story IDs match the Notion backlog (CC-N).
- Hypotheses are labeled H-E (elder), H-C (caregiver), H-G (guardian).
- "Demo" = demonstrated in the browser prototype with fictional data; "Prod" = production work not yet built.

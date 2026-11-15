# Quality & testing

## Test strategy

| Layer | Tool | What it proves | Where |
|---|---|---|---|
| Unit | Vitest | The data layer is correct: permission matrix, rules engine, audit chain, SHA-256, health detection, and a data class for every field (CC-9) | `src/__tests__/*.test.ts` |
| End-to-end | Python + Playwright (Chromium) | Real user journeys across the website and all three personas against the **production build** | `tests/e2e/e2e.py` |
| Family chat and evening recap | Python + Playwright (Chromium) | Sprint 12 screens: chat, health-detail sheet, Maggie's large-text chat and voice reply, the recap card and its switch (CC-194) | `tests/e2e/everyday.py` |
| Accessibility | axe-core injected by Playwright | No WCAG 2.1 A/AA violations on key screens | `tests/e2e/a11y.py` |
| Type safety | TypeScript strict mode | `npm run build` fails on type errors | `tsconfig.json` |
| Dependency audit | `npm audit` | Known vulnerable packages (0 on 2026-10-19, per the security test plan) | — |
| Manual | Demo guide | Presenter flows, visual review | [Demo guide](../product/demo-guide.md) |

The strategy favours **testing the rules where they live** (the data layer is pure and easy to test) and **testing behaviour end to end** for anything a person sees. A separate [security test plan (CC-78)](../../security/78-security-test-plan.md) covers ASVS/MASVS and the external penetration test.

## Current results (Sprint 13, 2026-11-14)

Measured on GitHub Actions for [PR #7](https://github.com/sumanth1996/circle-care/pull/7) (CC-194), which runs on every pull request to `main`.

| Suite | Count | Result |
|---|---|---|
| Unit tests | **475** in 11 files (client and server), plus 2 to-dos for doses and check-ins that cross midnight | All pass (`npm test`) |
| E2E scenarios | **29** | All pass, with no page or console errors |
| Chat and recap scenarios | **7** | All pass |
| Accessibility | **26** screens plus the evening recap card | **0** axe-core violations (WCAG 2.1 A/AA) |

### Unit tests by file (as of v0.4, 2026-10-19)

The Sprint 7 to 12 test files (`everyday.test.ts` and the server suites in `server/__tests__/`) came later and aren't broken down here.

| File | Tests | Covers |
|---|---|---|
| `policy.test.ts` | 183 | One generated test per resource × action × role (elder, guardian, family) plus a caregiver on-shift/off-shift test per resource × action; unknown and revoked people; pause sharing (CC-81); reviewer-only legal review |
| `health.test.ts` | 21 | Reading cadence and determinism (CC-85), detection rules (CC-86/88), activity, sleep, mood, BMI (CC-89–92), who can see readings (CC-87), appointment permissions and seed |
| `rules.test.ts` | 7 | Dose escalation, de-duplication, missed check-in (CC-52), suspicious access (CC-35, two tests), 24-hour approval reminder (CC-64), access expiry (CC-25) |
| `audit.test.ts` | 5 | Chain links, append, detects edit, deletion and reordering (CC-28) |
| `sha256.test.ts` | 1 | Matches Node's `crypto` across edge-case inputs |

### E2E scenarios

| # | Scenario |
|---|---|
| 1 | Website: every nav page resolves; pilot sign-up works |
| 2 | Website: mobile menu navigates |
| 3 | Guardian sign-in with MFA |
| 4 | MFA lockout after 5 wrong codes |
| 5 | Elder holds SOS, countdown, sends |
| 6 | Guardian acknowledges SOS, elder sees responder, resolves |
| 7 | Missed dose escalates to guardian, caregiver gives it, alert clears |
| 8 | CC-45 task note; CC-19 notes open once on shift |
| 9 | Guardian approves request; elder sees decision |
| 10 | Smart hand-off draft and check-out |
| 11 | CC-19 caregiver off shift cannot open notes |
| 12 | Elder pauses sharing; caregiver view is blocked |
| 13 | Guardian invites a new member |
| 14 | Weekly digest renders |
| 15 | CC-67 upload checks file type, encrypts, watermarked viewer |
| 16 | CC-24 review team rejects with reason; guardian told to resubmit |
| 17 | CC-35 suspicious access alerts the guardian |
| 18 | CC-64 24-hour approval reminder |
| 19 | CC-28 integrity check; CC-32 passphrase-encrypted export round-trip |
| 20 | CC-26 data at rest in the browser is encrypted |
| 21 | CC-22 guardian consents on the elder's behalf with a reason |
| 22 | CC-14 elder lock option; CC-48 elder suggests SOS-list change |
| 23 | CC-76 NPS survey scrubs health words; CC-77 dashboard hides small groups |
| 24 | CC-84/85/86/89-92 guardian Health: summary, vitals, table, activity |
| 25 | CC-86 a sudden heart-rate change alerts the guardian |
| 26 | CC-87 Maggie controls whether Sarah sees health readings |
| 27 | CC-94/96/97 month calendar: next-up, navigation, add and cancel |
| 28 | CC-27 sign out everywhere |
| 29 | CC-33 close circle deletes data and files |

The e2e run uses a 390 × 844 phone viewport in the `America/New_York` time zone and fails on page errors or console errors (excluding Unsplash image loads).

### Accessibility screens (axe-core)

`/`, `/how-it-works`, `/features`, `/who-its-for`, `/privacy`, `/pilot`, `/app`, `/app/elder`, `/app/elder/next`, `/app/elder/privacy`, `/app/elder/settings`, `/app/guardian`, `/app/guardian/meds`, `/app/guardian/approvals`, `/app/guardian/privacy`, `/app/guardian/notes`, `/app/guardian/settings`, `/app/guardian/circle`, `/app/guardian/digest`, `/app/guardian/health`, `/app/guardian/calendar`, `/app/caregiver`, `/app/pilot`, `/app/review`, `/app/guardian/chat`, `/app/elder/chat`, and the `#recap` card after Skip to 7 PM (added in CC-194, with the clock pinned to 4:30 PM ET) — at 1280 × 900, tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`.

Design-level accessibility commitments (WCAG 2.2 AA target): visible keyboard focus, labelled controls, *reduce motion* respected, 4.5:1 text contrast including on tinted backgrounds (CC-71), elder text up to ≈ 200% and touch targets ≥ 48 px.

## How to run

```bash
# Unit tests
npm install
npm test

# Type-check and production build
npm run build

# End-to-end and accessibility (needs Python 3 and Chromium)
npm run build && npx vite preview --port 4173 &
pip install playwright==1.49.1 && python -m playwright install chromium
python tests/e2e/e2e.py       # 29 scenarios
python tests/e2e/everyday.py  # 7 chat and recap scenarios
python tests/e2e/a11y.py      # 26 screens plus the recap card
```

Set `CHROMIUM_PATH` to use a specific Chromium binary. Failure screenshots and the test export file go to `tests/e2e/out/` (git-ignored).

## Known gaps

| Gap | Risk | Suggested fix |
|---|---|---|
| No unit tests for late caregiver check-in, coverage gaps or SOS escalation timing | Regressions in time-based rules | Add `rules.test.ts` cases with a fixed clock |
| No tests for `scrubHealth()` or `npsScore()` | Health terms leaking into research data | Table-driven unit tests |
| No e2e for shift swaps, shift offers, emergency-card edits or invitation acceptance | Untested journeys | Add scenarios |
| Hand-off, schedule, feed, emergency card and SOS screens not in the axe list | Unchecked accessibility | Add them to `a11y.py` |
| No visual regression tests | Layout bugs (e.g. the digest chart in the screenshot) | Playwright screenshot comparisons |
| The demo store can lose a change made in the last quarter second before the tab closes | A switch can come back after a quick reload; tests must wait for the save | Backlog story CC-195 |

## CI

`.github/workflows/browser-tests.yml` (CC-194) runs on every pull request to `main`, on pushes to `main` and on demand: `npm ci`, `npm test`, `npm run build`, then `vite preview` and the three browser scripts, keeping `tests/e2e/out/` as an artifact for 7 days. Each script exits with 1 on a failure, so the check goes red.

Since CC-198 the workflow runs Node 22 on `ubuntu-24.04`, pins every outside action to a full commit SHA with its release in a comment, keeps no token after checkout, and cancels an older run only for a pull request, so every run on `main` finishes. `src/__tests__/ci-workflow.test.ts` fails if any of that slips. To update an action, look up the new release's commit SHA and change the SHA and the comment together.

Still to add: `npm audit --audit-level=high`, `mkdocs build --strict` for this wiki, and branch protection so a red check blocks merging.

## Related pages

- [Security & privacy](security-and-privacy.md)
- [Traceability matrix](../traceability.md)
- [Security test plan (CC-78)](../../security/78-security-test-plan.md)

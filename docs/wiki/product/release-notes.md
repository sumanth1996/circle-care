# Release notes

Prototype versions are derived from the repository history (`git log`). All commits were made on **2026-10-19**; version numbers group them into meaningful increments. The `package.json` version field still reads `0.1.0` and has not been bumped — the numbers below are the product team's labels.

| Version | Theme | Commits | Tests at release |
|---|---|---|---|
| **v0.4** | California localisation and product documentation | `428fa2e` (+ this wiki) | 217 unit · 29 e2e · 24 screens axe-clean |
| **v0.3** | Health & Calendar for the guardian | `1dc1731`, `dce35c2`, `6c139a3` | 217 unit · 29 e2e · 24 screens axe-clean |
| **v0.2** | Full website, security stories, test suites, working docs | `d8dc28e`, `4e59e35`, `096dcca` | 180 unit · 25 e2e · 22 screens axe-clean |
| **v0.1** | Initial prototype | `78c70c5`, `ccb1a95`, `e5e532f` | None |

---

## v0.4 — California localisation and documentation

**Commit:** `428fa2e` *Use San Francisco, California for all example places*

### Changed

- All example places moved to **San Francisco, California**: pharmacy (Fog City Pharmacy, 1840 Irving St), clinics (Golden Gate Family Medicine, Presidio Eye Care, Bay Heart Center), lab (Bay Area Lab) and a Stow Lake walk in Golden Gate Park in the care notes.
- Demo phone numbers use the **415** area code.
- The pilot sign-up placeholder reads *"e.g. California"*; the sample pilot cohort is in California.
- Demo data version bumped (`STATE_VERSION = 6`) so browsers holding older demo data reseed automatically.

### Added

- This **Product Wiki** (MkDocs Material site): product overview, 13 feature pages, architecture and security, roadmap, traceability matrix and contribution guide.

### Known issues

- The SOS responder screen still shows the placeholder address *"214 Maple Ave (demo address)"*, which is not a San Francisco address.
- The website and emergency card show Maggie as **81**, while her birth year (1946) and the Health page give **80**.

---

## v0.3 — Health & Calendar

**Commits:** `1dc1731` *Run the dev server on port 5000 to match Replit's preview*, `dce35c2` *Add guardian Health and Calendar features*, `6c139a3` *Point weight helpers at story CC-93*

### Added

- **Health (CC-84 – CC-93)** for the guardian: a summary of highlights; heart-rate and blood-oxygen charts with a new simulated reading every 30 minutes (15/30/60 configurable); detection of high, low and sudden-change readings with guardian alerts; an accessible readings table; 30-day weight; activity rings, an hour-by-hour day strip, steps by hour, sleep stages and 7-day mood. See [Health insights](../features/health-insights.md).
- **Health sharing consent (CC-87):** Maggie controls whether Sarah sees health readings, from her Privacy Center. Only Maggie and Sarah can ever see readings.
- **Calendar (CC-94 – CC-98):** a full-month view of medication-related appointments with colour and icon per type, a month legend, an "Up next" banner, multiple appointments per day, day details (provider, medicines, escort, preparation), and add / edit / mark done / cancel. See [Care calendar](../features/care-calendar.md).
- Guardian Home tiles for **Health** and **Next appointment**; guardian Settings section for **Health readings** thresholds.
- Presenter controls: *Simulate a sudden heart-rate change* and *Simulate a low blood-oxygen reading*.

### Changed

- Dev server runs on **port 5000** to match Replit's preview.

### Quality

- 217 unit tests (new `health.test.ts`), 29 Playwright scenarios, axe-core clean on 24 screens.

---

## v0.2 — Website, security stories and tests

**Commits:** `d8dc28e` *Add website pages and complete the remaining Notion code stories*, `4e59e35` *Add e2e and accessibility test scripts*, `096dcca` *Add research, compliance, security and pilot drafts; close permission gaps*

### Added — website

- **How it works**, **Features**, **Who it's for**, **Privacy** and **Join the pilot** pages, real routes for every navigation link, and a mobile menu. See [Website & onboarding](../features/website-and-onboarding.md).

### Added — security and privacy stories

- Encrypted on-device storage with a non-extractable AES-256-GCM key (CC-26).
- App-switcher privacy cover and **Sign out everywhere** (CC-26, CC-27).
- Hash-chained, tamper-evident audit log with an integrity check in the Privacy Center (CC-28).
- Role permission matrix enforced on every action (CC-18, CC-19).
- Passphrase-encrypted export (CC-32); close the circle and delete its data (CC-33).
- Suspicious-access alerts (CC-35).
- File-type-checked, encrypted, watermarked documents (CC-67).
- Content Security Policy on production builds (CC-78).

### Added — product

- Review team console for legal documents (CC-24).
- On-device voice confirmation of doses (CC-73).
- Welcome tours and a free setup-call request (CC-75).
- In-app NPS survey (CC-76) and pilot dashboard with small-group suppression (CC-77).
- Gap fixes for CC-12, 14, 22, 39, 45, 48, 52, 59 and 64; colours tuned to WCAG 2.1 AA contrast (CC-71).

### Added — quality and documentation

- Vitest suites for the permission matrix, audit chain, SHA-256 and rules engine.
- `tests/e2e/e2e.py` (25 Playwright scenarios) and `tests/e2e/a11y.py` (axe-core audit of 22 screens, 0 violations).
- 16 working drafts in `docs/` for research, compliance, security and pilot stories (CC-1 – CC-10, CC-18, CC-30, CC-34, CC-74, CC-78, CC-79). See [Research & Compliance](../research-and-compliance.md).

### Fixed

- Every remaining data-changing action now goes through a permission check (new `handoffs` resource; elder-only and member-specific checks for check-in, SOS resolve, shift accept, consent and close circle).
- Corrected the CSP comment: a `<meta>` CSP cannot block framing.

---

## v0.1 — Initial prototype

**Commits:** `78c70c5` *Initial commit*, `ccb1a95` *Circle Care prototype: Keynote-style site and installable app for elder, caregiver and guardian*, `e5e532f` *Merge GitHub starter commit*

### Added

- A Keynote-style **landing page** and an **installable PWA** with three experiences on one shared data store:
    - **Elder (Maggie):** three-button home, reminders, SOS with hold and countdown, call my person, decisions, text size, consent.
    - **Caregiver (Ana):** shift check-in, today's doses and tasks, hand-off, schedule.
    - **Guardian (Sarah):** home, medications, approvals, care circle, schedule, activity, weekly digest, settings.
- The buildable MVP stories from the Notion backlog plus four approved features added during the build:
    - **CC-80** Persona switcher demo mode
    - **CC-81** Privacy Center
    - **CC-82** Smart hand-off summary
    - **CC-83** Weekly family digest
- Demo seed data, rules engine, service worker and web app manifest. Runs entirely in the browser.

## Related pages

- [Roadmap](../roadmap.md) — what comes after the prototype
- [Traceability matrix](../traceability.md)
- [Quality & testing](../architecture/quality-and-testing.md)

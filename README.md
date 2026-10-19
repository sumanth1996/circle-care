# Circle Care

**Care, in one circle.** Circle Care keeps an older adult, their caregivers and their legal guardian on the same page, with the elder in charge of who sees what.

This repository is a working product prototype built from the Circle Care roadmap and backlog in Notion. It includes:

- **A Keynote-style website** that introduces the product, the three people it serves, and its privacy promise.
- **One installable app with three experiences:**
  - **Maggie (elder)** — three big buttons (What's next, SOS, Call my person), spoken reminders, and a Privacy Center.
  - **Ana (caregiver)** — shift check-in, today's doses and tasks, and a hand-off note that drafts itself.
  - **Sarah (legal guardian)** — today at a glance, approvals, care circle, schedule, activity and a weekly digest.

> **Demo data only.** Everyone in the app is fictional. All data lives in your browser's local storage and is never sent anywhere. No real health information should be entered.

---

## Try it

| | |
|---|---|
| Website | `/` |
| App | `/#/app`, then pick a person |
| Demo MFA code | `482913` |
| Switch person / presenter controls | Tap the **Demo · Name** pill at the top of the app |

Presenter controls let you skip time ahead, simulate a missed dose, a missed check-in or a late caregiver, trigger SOS, lock the app, and reset the demo.

**A good 3-minute demo:**

1. **Maggie:** press and hold **SOS**.
2. **Sarah:** switch to her, tap **I'm on my way**.
3. **Maggie:** switch back — she sees "Sarah is coming".
4. **Presenter controls:** *Simulate a missed dose*.
5. **Sarah's dashboard:** it flags the dose.
6. **Ana:** marks it given, then taps **End shift** to see the auto-drafted hand-off.

### Install on a phone

Open the deployed URL in Safari (iOS) or Chrome (Android), then choose **Share → Add to Home Screen**. The app opens full-screen and works offline after the first visit.

---

## Run it

### On Replit

1. In Replit, choose **Create Repl → Import from GitHub** and paste this repository's URL.
2. Press **Run**. Replit installs dependencies and starts the dev server (`.replit` is preconfigured).
3. To publish, open **Deploy → Static**. The build command and `dist` output folder are already set in `.replit`.

### Locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

Requires Node 20+.

---

## Design

- **Apple-inspired, light and inviting:**
  - System font (SF Pro on Apple devices, Inter elsewhere) at Keynote scale.
  - A light canvas (`#FBFBFD`).
  - iOS-style grouped lists, switches, sheets and notification banners.
- **One soft color per person:**
  - Elder: sunrise orange.
  - Caregiver: teal.
  - Guardian: indigo.
  - Red is reserved for emergencies.
- **Elder mode:**
  - Three text sizes (up to the largest).
  - High contrast.
  - Read-aloud using on-device speech.
  - 48 px+ touch targets.
- **Accessibility:**
  - Visible keyboard focus.
  - Labeled controls.
  - Respects *reduce motion*.
  - Aims for WCAG 2.2 AA.

## Privacy by design (what the prototype demonstrates)

- **Minimum necessary:** professional caregivers see medicines and tasks only while checked in to a shift.
- **The elder owns her data:**
  - Privacy Center: who has access, the access log, one-tap **Pause sharing**.
  - Removing members.
  - Exporting data.
  - Plain-language consent.
- **PHI-free notifications:** lock-screen text never names a medicine or condition; details appear only inside the app.
- **Every access is logged:** views and changes are written to an audit trail the elder can read.
- **Guardian verification:** legal-authority documents are reviewed before guardian permissions apply.
- **Session lock:** caregiver and guardian apps lock after inactivity.

### What a production build still needs

The prototype runs entirely in the browser. A real deployment must add:

- server-side role-based access checks;
- encryption at rest with managed keys;
- a tamper-evident server audit log;
- signed BAAs with every vendor that touches health data;
- real push/SMS delivery and critical-alert entitlements;
- identity and document verification;
- breach response;
- a third-party penetration test.

These are tracked as stories in the Notion backlog.

## How this maps to the backlog

The roadmap, epics, features and user stories live in Notion: **Circle Care — Product Hub**. Code comments reference story IDs (for example `CC-46` for hold-to-send SOS). Every story built here has a comment on its Notion page describing what was delivered.

Four features were added beyond the original backlog during the build:

- Persona switcher demo mode (`CC-80`)
- Privacy Center (`CC-81`)
- Smart hand-off summary (`CC-82`)
- Weekly family digest (`CC-83`)

## Project structure

```
src/
  data/        types, demo seed data, selectors, store + rules engine (escalations)
  components/  app shell, persona switcher, UI kit (sheets, switches, rings…)
  pages/       Landing site, Welcome, Sign-in, Invite
    elder/     Home, Next, SOS, Call, Decisions, Settings, Consent
    caregiver/ Today, Hand-off, Schedule
    guardian/  Home, Medications, Approvals, Circle, Schedule, Activity, Digest, Settings
    shared/    Privacy Center, Emergency card, SOS responder, Notes & documents, Alerts
public/        manifest, service worker, icons
```

Stack: React 19, TypeScript, Vite, React Router, lucide-react icons. No backend.

## Credits

- **Photography:** from [Unsplash](https://unsplash.com), used under the Unsplash License. Photographers are credited in the site footer.
- **Product owner:** Sumanth.

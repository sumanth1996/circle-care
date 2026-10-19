# Glossary

Terms used across the product, the code and this wiki. Code identifiers are shown in `monospace` where a term maps directly to the data model.

| Term | Meaning |
|---|---|
| **Access log** | The record of who viewed, created, changed, approved, exported or was refused what, and when (`AuditEvent`). Shown to the elder and guardian in the Privacy Center. Never stores health values. See *Tamper-evident*. |
| **Acknowledge (hand-off)** | The next caregiver tapping **I've read this** on the previous shift's hand-off. Unread hand-offs appear on the guardian's attention list. |
| **Acknowledge (SOS)** | A responder tapping **I'm on my way**. This stops escalation and tells the elder who is coming. |
| **Adherence** | Share of scheduled doses recorded as taken. Shown per day in the weekly digest. |
| **Alert** | An in-app notification (`Alert`) with a PHI-free `title` (what the lock screen would show) and an in-app `detail`. Has a severity: info, warning or critical. |
| **Approval** | A request that waits for the guardian's decision: a medicine change, a new member or a shift swap (`Approval.kind`). The elder sees every decision. |
| **BAA** | Business Associate Agreement — the HIPAA contract required with any vendor that handles protected health information for a covered entity. Tracked in the [vendor register](../../compliance/30-vendor-baa-register.md). |
| **Care circle** | The elder plus everyone helping them: guardian, family and professional caregivers. One circle per elder. |
| **Care task / routine** | A recurring non-medicine activity such as breakfast, a shower or a walk (`CareTask`), daily, weekdays or weekends, assigned to the caregiver on shift or to the elder. |
| **Check-in (daily)** | The elder's one-tap **I'm OK** each morning, optionally with a mood. Expected inside the check-in window (default 08:00–10:00). |
| **Check-in / check-out (visit)** | A professional caregiver confirming arrival and departure for a shift (`Visit.checkIn` / `checkOut`). Location is confirmed once at each, or a manual reason is recorded. |
| **Consent** | The elder's agreement to the plain-language privacy terms (version and time stored). A verified guardian can accept on her behalf with a written reason. |
| **Coverage gap** | A scheduled shift with no caregiver assigned or not yet accepted. |
| **Critical alert** | An alert that breaks through silent mode (SOS, missed high-priority doses) when *Emergencies break through silent mode* is on. In the prototype this is a setting only; delivery is not built. |
| **Demo mode** | The **Demo · Name** pill at the top of the app, which opens the persona switcher and presenter controls (CC-80). |
| **Escalation (dose)** | An unconfirmed dose alerts the caregiver after 30 minutes and the guardian after 60 minutes by default; high-priority medicines escalate twice as fast (15 and 30 minutes). |
| **Escalation chain (SOS)** | The ordered list of people alerted when the elder presses SOS (default Sarah → Ana → James). The next person is added every 2 minutes until someone acknowledges. |
| **Elder** | The older adult the circle is built around. In the demo, Maggie. |
| **Emergency card** | A first-responder summary (allergies, conditions, medicines, directives, contacts) that the elder approves. |
| **Guardian / legal guardian** | The person with legal authority to make health decisions with or for the elder — here, Sarah as healthcare POA. Gets guardian permissions only after the review team verifies their documents. |
| **Hand-off** | The end-of-shift summary a caregiver sends at check-out: mood, meals, concerns, notes and a summary (`Handoff`). The prototype drafts the summary automatically (CC-82). |
| **High-priority medicine** | A medicine flagged `critical` (Lisinopril in the demo). Missed doses escalate twice as fast and are marked critical. |
| **HIPAA** | The US Health Insurance Portability and Accountability Act. Circle Care is *designed to* its Privacy, Security and Breach Notification Rules; whether it legally applies depends on the business model (see the [regulatory memo](../../compliance/08-regulatory-memo.md)). |
| **k-anonymity (minimum cohort)** | On the pilot dashboard, any group with fewer than 5 responses is hidden so no one can be singled out. |
| **Minimum necessary** | The HIPAA principle that each person sees only the information needed for their role. In Circle Care, caregivers see care details only during shifts. |
| **MFA** | Multi-factor authentication — the 6-digit code step after the password. Demo code `482913`. |
| **North Star** | The single metric the product optimises: *verified care tasks completed on time this week* (doses taken within 60 minutes of schedule plus completed care tasks over the last 7 days). |
| **NPS** | Net Promoter Score: % of 9–10 scores minus % of 0–6 scores, from −100 to 100. Collected in-app (CC-76). |
| **On shift (`pro@shift`)** | A professional caregiver with a check-in today and no check-out. The permission matrix grants care-detail access only in this state. |
| **Pause sharing** | The elder's one switch that limits family and caregivers to SOS, the emergency card and the circle list (CC-81). The guardian keeps access. |
| **PHI** | Protected health information — health data that identifies a person. Circle Care keeps PHI out of notifications, emails, the audit log and pilot data. |
| **POA (healthcare power of attorney)** | A legal document naming someone to make health decisions for a person. Sarah's POA is the demo's legal-authority document. |
| **Presenter controls** | Buttons in demo mode that fast-forward time or simulate events (missed dose, late caregiver, SOS…). |
| **Privacy Center** | The elder's (and guardian's) page for who can see her information, the access log, sharing switches, export, sign-out everywhere and closing the circle. |
| **Privacy shield** | A blank cover that replaces the screen when the app goes to the background so the app-switcher snapshot shows no health data. |
| **PWA** | Progressive Web App — a website that can be installed to a phone's home screen and opened offline after the first visit. |
| **Respite caregiver** | A temporary caregiver who covers for the usual one. Ruth in the demo, with 14-day access. |
| **Review team** | Internal Trust & Safety staff who verify legal-authority documents (CC-24). |
| **Rules engine** | The `evaluate()` function in `src/data/store.tsx` that turns time and state into alerts (missed doses, check-ins, late caregivers, SOS steps, reminders, suspicious access, abnormal vitals, access expiry). Runs every 15 seconds and after every change. |
| **Session lock** | The app locks after inactivity: 15 minutes by default for caregiver and guardian; off by default for the elder, who can choose 5 or 15 minutes. |
| **Suspicious access** | 8 or more record views by one person within 5 minutes, or 3 or more refused actions within 10 minutes, which alert the guardian (CC-35). |
| **Tamper-evident** | Each access-log entry stores a SHA-256 hash of itself and of the previous entry, so editing, deleting or reordering any entry breaks the chain and is detected. |
| **Time-limited access** | A member's `expiresOn` date after which their access is revoked automatically (CC-25). |
| **Verified dose** | A dose recorded by a caregiver who was checked in at the time (`DoseLog.verified`). |
| **Vitals** | Heart rate and blood oxygen readings from the elder's watch — simulated in the prototype every 30 minutes. |
| **Weekly digest** | The guardian's weekly summary: adherence, visits, check-in streak, North Star, and anything worth knowing. The email version contains no PHI (CC-83). |

## Related pages

- [Personas](personas.md)
- [Data model](../architecture/data-model.md)
- [FAQ](faq.md)

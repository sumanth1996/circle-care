# Pilot Plan

Notion story: CC-74 Run a pilot with 15–25 care circles
Status: DRAFT plan — pilot not started; no circles recruited. Proposed start May 2027 (as stated on the `/pilot` page). Blocked on production readiness items listed in §9.

## 1. Purpose

Learn, with real families over 8 weeks, whether Circle Care increases **verified care tasks completed on time** (North Star, CC-6) without making the elder feel watched, and whether caregivers and guardians would keep using it.

The pilot is a learning exercise, not a launch. We expect to find things that don't work.

## 2. Pilot size and mix

- **15–25 care circles.** Below 15, per-persona NPS cohorts will often fall under the minimum of 5 and be hidden on the dashboard.
- Target mix:
  - at least 8 circles with a professional caregiver visiting (to test shift mode);
  - at least 5 circles with a long-distance guardian;
  - at least 3 states (state-law differences, CC-8);
  - elders with a range of phone comfort.

## 3. Eligibility

| Criterion | Rule |
|---|---|
| Elder | 65+, lives at home or with family, **able to give her own consent** to join (no proxy consent for the pilot in v1) |
| Guardian / POA | Holds healthcare POA or guardianship; willing to upload documents for review (CC-24) |
| Circle | At least 2 members besides the elder |
| Devices | Elder has an iPhone or Android phone, or a tablet at home; others have smartphones |
| Medicines | Elder takes 2+ scheduled medicines |
| Exclusions | Hospice or end-of-life care; elder in a facility; anyone employed by a competing product; circles currently in a crisis (recent hospitalization within 2 weeks) — invite later |
| Agencies | If an agency caregiver joins, written agency permission; if the agency is a HIPAA covered entity, a BAA must be in place first (CC-8, CC-30) |

## 4. Recruiting via `/pilot`

- The `/pilot` page form asks: name, email or phone, role, state, whether a professional caregiver visits, and consent to be contacted. It warns "Please don't include any health information here."
- In the prototype, only role, state and `hasPro` are stored (`addPilotLead` in `src/lib/pilot.ts`); name and contact are dropped. **Production must store contact details** in a separate, access-restricted store so we can call people back — and delete them after the pilot.
- The page promises "We'll reach out within two weeks." Assign an owner to keep that promise.
- Additional channels: the CC-1 channels (AAAs, senior centers, agencies, support groups); interview participants who opted in.
- Screening call (15 min) using a short version of the CC-1 screener.

## 5. Onboarding — white-glove setup call (CC-75)

30-minute call per circle, elder present.

1. Introductions; explain what the pilot is and isn't (not an emergency monitoring service).
2. Consent: walk through plain-language consent with read-aloud (CC-22); elder consents herself.
3. Create the circle; invite members by role; set time-bound access for respite caregivers (CC-25).
4. Guardian uploads legal document; explain review time.
5. Enter medicines **with the guardian**; mark high-priority medicines.
6. Set check-in window, escalation order, quiet hours.
7. Elder: choose text size and contrast; try What's next, SOS hold-and-cancel, Call my person.
8. Show the Privacy Center: who can see, access log, Pause sharing.
9. Agree on support contact and what to do in a real emergency (call 911 first).

In-app: first-run tour per persona and a "request a setup call" option (`settings.setupCallRequested`, CC-75).

## 6. Timeline (8 weeks)

| Week | Activity |
|---|---|
| −4 to −1 | Recruit, screen, schedule setup calls; production readiness gate (§9) |
| 0 | Setup calls; baseline survey (how many check-in calls per day today, time spent coordinating) |
| 1 | Day-3 check-in call (short); fix onboarding issues |
| 2–3 | Normal use; monitor dashboard weekly |
| 4 | Mid-point check-in (15 min per persona); in-app NPS prompt |
| 5–7 | Normal use; targeted interviews on emerging themes |
| 8 | Final conversation (30 min); final NPS; exit survey |
| +2 | Synthesis; go/no-go recommendation |

Matches the `/pilot` page promise: "A 30-minute setup call, two short check-ins, and a final conversation."

## 7. Success metrics

Viewed on the internal pilot dashboard `/app/pilot` (CC-77). The prototype dashboard currently shows a **"Sample cohort"** of invented numbers to design the layout — not results.

| Metric | Definition | Target | Source |
|---|---|---|---|
| **North Star** | Verified care tasks completed on time per circle per week (median) | Rising week over week; baseline set in weeks 1–2 | Dose and task logs |
| Dose confirmation rate | Scheduled doses with a taken/skipped/refused record ÷ scheduled doses | **≥90%** (dashboard goal) | `doses` |
| Daily check-in rate | Days with an "I'm OK" in the window ÷ pilot days | ≥80% by week 8 | `checkins` |
| Alert answered time | Median minutes from critical/warning alert to acknowledgment | **<10 min median** | Alerts, SOS acknowledgments |
| NPS by persona | % 9–10 minus % 0–6, per elder / caregiver / guardian | Report only where n ≥ 5 (`MIN_COHORT`); targets set after baseline | In-app feedback (CC-76) |
| Weekly active circles | Circles with any activity in the week | ≥80% of enrolled through week 8 | Aggregates |
| Guardrails | Sharing paused 7+ days; members removed; alert volume per guardian per week | Watch and follow up, no target | Aggregates |

Qualitative: did the elder feel more or less in control? Did caregivers save time? Did guardians call less?

## 8. Consent and data handling

- **Pilot data is separate** from circle data (`src/lib/pilot.ts` pattern): pilot leads and NPS responses live in their own store with no link to circle records.
- **De-identified:** dashboard shows aggregates only; groups under 5 hidden; free-text feedback scrubbed of health terms (`scrubHealth`) and never shown on the dashboard.
- **Deletion:** pilot research data is deleted **12 months after the pilot ends** (stated on the dashboard). Circle data follows normal product rules: a family that leaves can close the circle and have data deleted (the `/pilot` page says "Your data is deleted when you do").
- Interview notes follow CC-1 de-identification rules.
- No data used for anything other than improving Circle Care; no sale, no advertising.
- Incentive: free for life for pilot families plus a thank-you gift card (as promised on `/pilot`) — **budget and legal review of "free for life" needed**.

## 9. Production readiness gate (must be true before week 0)

- [ ] Real backend with server-side permission checks (CC-19) — currently none.
- [ ] Real push/SMS delivery with PHI-free content and tested SOS fallback.
- [ ] BAAs in place for vendors that may touch PHI (CC-30).
- [ ] HIPAA security risk analysis reviewed (CC-79).
- [ ] Incident response roles assigned; tabletop run (CC-34).
- [ ] External pen test completed and highs fixed (CC-78).
- [ ] Counsel reviewed consent text, privacy policy, pilot terms (CC-8).

## 10. Exit criteria

**Continue to broader beta if all are true:**
- Dose confirmation ≥90% in weeks 5–8 for most circles.
- Median alert answered under 10 minutes.
- At least 70% of circles still active in week 8.
- No SEV-1 incidents; any SEV-2 resolved with root cause fixed.
- Elders, in final conversations, mostly report feeling in control (qualitative).

**Stop or rethink if any is true:**
- A safety failure (SOS or escalation not delivered) that we can't explain and fix.
- Elders report feeling surveilled in a majority of circles.
- Caregivers report net added time in a majority of circles.

**Participant exit at any time:** circle closed and data deleted on request; NPS responses already given stay de-identified in the research store until its deletion date — **disclose this in consent**.

## 11. Human actions

- [ ] Assign pilot owner and support contact.
- [ ] Production readiness gate (§9).
- [ ] Budget for incentives and setup-call time.
- [ ] Counsel review of consent and "free for life" promise.

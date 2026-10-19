# Competitive Teardown

Notion story: CC-7 Competitive teardown of care-coordination products
Status: DRAFT. All product facts below are **"verify before publishing — as of training knowledge"**. They were written from general knowledge, not from hands-on testing, current websites or pricing pages. Products change, merge and shut down; someone must re-check every row before this is shared outside the team.

## 1. Teardown framework

For each product, a reviewer installs or demos it (where allowed by terms of service) and scores these dimensions. Do **not** create fake accounts that misrepresent who you are; use a personal account or vendor demo.

| Dimension | Question | Why it matters for Circle Care |
|---|---|---|
| Primary user | Who does the product serve first? | Circle Care puts the **elder** at the center, not the family or agency |
| Circle model | Can multiple roles share one person's care? Are roles different? | Our role matrix (CC-18) is core |
| Elder UI | Can an older adult use it directly (large text, few choices, voice)? | Three-button elder home (CC-68) |
| Medication | Reminders, confirmation, escalation to others? | Dose confirmation + escalation (CC-39–43) |
| Safety | SOS / fall / check-in? Who responds? | Hold-to-send SOS with chain (CC-46–48), daily I'm OK |
| Paid-care workflow | Shifts, visit verification, hand-offs? | Caregiver shift mode (CC-54–60, CC-82) |
| Guardian/legal | Any verification of legal authority? | Guardian verification (CC-23/24) |
| Elder privacy control | Can the elder see/limit who sees what? Access log? | Privacy Center (CC-81) |
| Notification privacy | Do lock screens show health details? | PHI-free notifications (CC-31) |
| Business model | Free/ads/subscription/B2B/device? | Informs pricing and trust posture |
| HIPAA posture | Consumer app, BAA-capable, or covered-entity tool? | See CC-8 |

Scoring: 0 = absent, 1 = basic, 2 = strong. Record evidence (screenshot reference or URL + date) for each score.

## 2. Products and categories in scope

| # | Product / category | Category | Primary user (as understood) |
|---|---|---|---|
| 1 | CaringBridge | Health journaling / updates | Family sharing updates with a wide network |
| 2 | Lotsa Helping Hands | Volunteer coordination | Family organizing helpers (meals, rides) |
| 3 | Medisafe | Medication management | Individual patient; optional "Medfriend" |
| 4 | Life360 | Family location / safety | Family members (often parents of teens) |
| 5 | Lively (formerly GreatCall) | Senior phones + medical alert | Older adult, with family/caregiver features |
| 6 | CareZone-style family health organizers | Family health records / meds | Family caregiver (note: CareZone itself was acquired and shut down — verify) |
| 7 | Home-care agency software (e.g., AxisCare, WellSky Personal Care) | Agency operations, scheduling, EVV, billing | Agency staff and caregivers |

## 3. Comparison table (verify before publishing — as of training knowledge)

Legend: 0 absent · 1 basic · 2 strong · ? unknown — verify

| Dimension | CaringBridge | Lotsa Helping Hands | Medisafe | Life360 | Lively | CareZone-style | Agency software | **Circle Care (target)** |
|---|---|---|---|---|---|---|---|---|
| Elder is primary user | 0 | 0 | 2 | 0 | 2 | 0 | 0 | 2 |
| Multi-role circle | 1 (followers) | 1 (helpers) | 1 (Medfriend) | 1 (family circle) | 1 | 1 | 2 (internal staff roles) | 2 |
| Elder-friendly UI | 0 | 0 | 1 | 0 | 2 (device-led) | 0 | 0 | 2 |
| Med reminders | 0 | 0 | 2 | 0 | 1 ? | 1 | 1 (eMAR in some) | 2 |
| Escalation to others on missed dose | 0 | 0 | 1 | 0 | ? | 0 | 1 ? | 2 |
| SOS / urgent response | 0 | 0 | 0 | 1 (SOS feature) | 2 (urgent response service) | 0 | 0 | 1 (chain to circle, no monitoring center) |
| Shift / visit verification | 0 | 0 | 0 | 0 | 0 | 0 | 2 (EVV) | 1 |
| Hand-offs | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 2 |
| Guardian / POA verification | 0 | 0 | 0 | 0 | 0 | 0 | ? | 2 |
| Elder controls who sees what | 0 | 0 | 1 | 0 | ? | 0 | 0 | 2 |
| Access log visible to elder | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| PHI-free lock screen | ? | ? | ? | n/a | ? | ? | ? | 2 |
| Business model | Nonprofit, donations | Free / partner-sponsored | Freemium + pharma partnerships ? | Freemium subscription | Device + monthly plans | Free (defunct) | B2B SaaS | TBD (pilot free) |

**Do not publish the "Circle Care" column as fact.** It describes the prototype's intent. Several items (SOS delivery, EVV-grade verification) are demonstrated only in a browser prototype without real delivery.

## 4. Positioning gaps Circle Care targets (hypotheses)

1. **Nobody puts the elder in charge of the circle.** Family tools (CaringBridge, Lotsa, Life360) are built for the family; agency tools are built for the agency. Circle Care's bet: the elder owns the circle, sees an access log and can pause sharing. *Validate with H-E2, H-E3.*
2. **Family tools and agency tools don't meet.** Agency software verifies visits but families rarely see it in real time; family tools have no idea a paid caregiver exists. Circle Care's shift mode (`pro@shift`) bridges this. *Validate with H-C6 and T8 in CC-6.*
3. **Medication apps stop at the individual.** Single-user med apps remind but escalate weakly, and don't distinguish a refusal from a miss. Circle Care records taken/skipped/refused and escalates caregiver-first. *Validate with H-E4, H-G3.*
4. **Medical alert is a device business.** Pendant services offer professional monitoring Circle Care does not. Circle Care should **not** claim to replace a monitored alert service. Position SOS as "alert your circle," and consider partnering rather than competing.
5. **Legal authority is unverified everywhere.** Most family apps let anyone call themselves "guardian." Verified guardian status (CC-24) is a trust differentiator — and an operational cost.

## 5. Threats and parity risks

| Risk | Example | Response |
|---|---|---|
| A large family-safety app adds a "parents" mode | Life360-style product extends to elders | Lean on elder control and privacy story; they're location-centric |
| Agency software adds a family portal | AxisCare/WellSky-style family portals | Partner/integrate rather than compete on EVV |
| Free alternatives (group texts, shared calendars) | Status quo | Must beat on time saved (H-C1, H-G1), not features |
| Medical-alert companies add family apps | Lively-style | Don't compete on monitoring; compete on care coordination |

## 6. Human actions

- [ ] Assign a reviewer per product; capture evidence with date for each score.
- [ ] Confirm current ownership/status of each product (acquisitions, shutdowns, rebrands).
- [ ] Replace "?" cells; remove any claim not backed by evidence.
- [ ] Review competitor terms of service before testing.
- [ ] Re-date the Status line when verified.

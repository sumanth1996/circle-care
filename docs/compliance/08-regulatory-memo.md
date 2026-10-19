# Regulatory Applicability Memo

Notion story: CC-8 Regulatory applicability memo
Status: DRAFT for counsel review — not legal advice. Written by the product owner from general knowledge as of 2026-10-19. No lawyer has reviewed it. Every conclusion below is a working assumption to be confirmed or corrected by qualified counsel before launch or pilot.

## 1. Purpose

Identify which laws likely apply to Circle Care, under which business models, so the backlog includes the right controls and counsel's time is focused on the right questions.

## 2. Product facts relevant to the analysis

- Circle Care stores, for one older adult ("the elder"): medication list and schedule, dose logs (taken/skipped/refused), care tasks, visit check-ins, care notes, uploaded documents (care plans, discharge summaries, legal authority documents), an emergency card (allergies, conditions, directives, blood type), SOS events, daily check-ins, and an access log. See CC-9 data inventory.
- Users: the elder, a verified legal guardian/healthcare POA, family members, professional caregivers (agency-employed or private), and an internal review team that verifies legal documents.
- Channels: in-app, push, SMS, email. Lock-screen and email text is designed to carry no health information (CC-31; Digest email "carries no PHI").
- Current prototype is browser-only with fictional data; nothing is transmitted. This memo is about the production product.

## 3. HIPAA

### 3.1 When HIPAA likely does **not** apply directly

HIPAA applies to covered entities (health plans, clearinghouses, providers who conduct standard electronic transactions) and their business associates. When a family downloads Circle Care and uses it on its own, Circle Care is likely a **consumer health app**, not a covered entity or business associate, even though it holds health information.

### 3.2 When Circle Care likely **is** a business associate

| Scenario | Likely status (to confirm) |
|---|---|
| A home-care agency that is a HIPAA covered entity contracts with Circle Care to coordinate its clients' care | Circle Care = business associate of the agency; BAA required |
| A health system or Medicaid waiver program offers Circle Care to patients and receives data back | Likely business associate |
| A private-pay caregiver (not a covered entity) uses Circle Care | HIPAA likely does not apply via that caregiver |
| An agency that does **not** bill electronically (may not be a covered entity) | Unclear — counsel question Q2 |
| Mixed: one circle includes an agency caregiver (BA relationship) and family (consumer) | Unclear which data is PHI under the BAA — Q3 |

### 3.3 Plan: operate as HIPAA-ready regardless

Because the business model may include agencies, and because the same data is equally sensitive either way, Circle Care plans to meet the HIPAA Privacy, Security and Breach Notification Rules as a design standard for all circles:

- Security Rule safeguards: risk analysis (CC-79), access control (CC-18/19), audit controls (CC-28), integrity, transmission security, workforce training, contingency planning.
- Minimum necessary: caregivers see the plan only on shift (`pro@shift`).
- Individual rights mirrored as product features: access/export (CC-32), access log (CC-29), amendment (open: no "request a correction" flow yet).
- BAAs with every vendor that may touch health data (CC-30).
- Breach response (CC-34).

The public Privacy page already states this posture ("designed to the HIPAA standard… even where HIPAA doesn't legally apply"). **Counsel must review that wording** before it is used publicly (Q1).

## 4. FTC Act §5 and the FTC Health Breach Notification Rule (HBNR)

- **Section 5 (unfair or deceptive practices):** every privacy promise on the website and in the app is a representation the FTC can enforce. The "Things we will never do" list on `/privacy` must be true in production (e.g., "Use analytics that can identify a person"). Track each promise as a testable requirement.
- **HBNR (16 CFR Part 318):** applies to vendors of personal health records and related entities **not** covered by HIPAA. As amended (2024), it is understood to cover health apps that draw information from multiple sources; Circle Care draws from the elder, caregivers and family, and possibly device/health integrations later. A "breach" includes unauthorized disclosures, not only hacks — e.g., sharing with an analytics vendor without authorization.
- Implication: in consumer mode, a breach could require notice to individuals, the FTC and possibly media. Timelines differ from HIPAA. Counsel to confirm (Q4).

## 5. State laws (examples, not exhaustive)

| Law | Why it may apply | Product implications (to confirm) |
|---|---|---|
| Washington My Health My Data Act (MHMDA) | Covers "consumer health data" of WA residents, broadly defined; private right of action | Separate consumer health data privacy policy; consent before collection and separate consent before sharing; right to delete; no geofencing near health facilities; restrictions on selling. Visit check-in uses location — confirm how (Q6). |
| Similar state health-data laws (e.g., Nevada, Connecticut amendments) | Similar consumer health data concepts | Maintain a state-law tracker |
| California CMIA | May apply to businesses offering software designed to maintain medical information for consumers | Confidentiality obligations; restrictions on disclosure |
| California CCPA/CPRA | Applies if thresholds are met; "sensitive personal information" includes health | Notice at collection, right to limit use of sensitive PI, deletion, access |
| State breach notification laws | All states; many include medical information | Track state-by-state timelines in CC-34 |
| State guardianship/POA statutes | Validity and scope of authority vary by state | See §8 |
| State EVV rules (Medicaid personal care) | If agencies use Circle Care for Medicaid visits | Circle Care is **not** an EVV system; don't market as one |

## 6. TCPA (SMS and calls)

- SMS reminders and alerts to circle members are likely informational, but TCPA consent rules still apply for automated texts to mobile numbers.
- Plan: obtain express consent per phone number at invite acceptance (CC-17), honor STOP/HELP, record consent with timestamp, respect quiet hours (default 22:00–07:00 in `settings.quietHours`; SOS bypass is a design choice to review — `criticalBypass`).
- Elder's number may be entered by a guardian: confirm who can consent on the elder's behalf (Q8).
- SMS carries no PHI by design. SOS SMS fallback (`via: "sms-fallback"`) must also be PHI-free.
- Carrier registration (10DLC) and provider terms — operational, not legal, but blocks launch.

## 7. Accessibility — ADA and WCAG

- The prototype aims for WCAG 2.2 AA (README). Title III's application to apps and websites is subject to evolving case law and DOJ guidance; if Circle Care contracts with state Medicaid programs or public entities, Title II web rules with WCAG 2.1 AA may apply via contract.
- Plan: WCAG 2.2 AA as the bar; automated (axe-core) plus manual screen reader testing (VoiceOver, TalkBack) and testing with older adults. See CC-78.

## 8. Guardianship / POA document handling

- Documents uploaded as "Legal authority" are reviewed by the internal review team (`/app/review`, CC-24). Reviewers see only the legal document queue.
- Questions: what does a reviewer actually need to confirm (name match, signature, court seal, activation/springing conditions, expiration, scope — healthcare vs. financial)? What liability arises if a reviewer approves a forged or revoked document?
- Retention: legal documents are highly sensitive; keep only as long as needed to evidence the verification decision (Q10).
- Scope limits: a healthcare POA may not authorize everything in the app (e.g., removing family members). Map app permissions to typical authority scope.
- Product tension to flag: the elder retains rights even with a guardian. Today the policy lets the guardian approve med changes and write settings; the elder is notified of every decision (CC-65) but cannot block them.

## 9. Other areas to check

- **FDA:** Circle Care does not diagnose or recommend treatment; medication reminders and adherence logging are generally viewed as low-risk wellness/administrative functions. Confirm no feature crosses into device software (e.g., dose recommendations).
- **Elder abuse mandatory reporting:** if the review team or support staff see evidence of abuse, are there reporting obligations? (Q12)
- **COPPA:** not expected (no users under 13), but family members could include minors (e.g., grandchildren). Set a minimum age.
- **Electronic signatures / consent records:** consent version and timestamp are stored (`settings.consent`, CC-22), including "on behalf" consent with a documented reason.

## 10. Open questions for counsel

| # | Question |
|---|---|
| Q1 | Is the public statement "designed to the HIPAA standard… even where HIPAA doesn't legally apply" acceptable, or does it create misleading expectations? |
| Q2 | Which home-care agencies are covered entities (e.g., private-pay-only agencies)? How should contracts differ? |
| Q3 | In a mixed circle, which data is PHI under a BAA and which is consumer data? Can one data store serve both? |
| Q4 | Does the amended HBNR apply in consumer mode? What counts as a "breach of security" for us? |
| Q5 | What do we need to meet the MHMDA (policy, consent flows, deletion timelines)? Does it apply if we have no WA users at launch? |
| Q6 | Does door check-in location capture create "precise location" or geofencing issues under state laws? |
| Q7 | Do CMIA and CCPA/CPRA apply at our expected size? |
| Q8 | Who may consent to SMS on an elder's behalf (guardian, POA)? |
| Q9 | Is our SOS feature at risk of being perceived as a monitored emergency service? What disclaimers are needed? |
| Q10 | Minimum and maximum retention for legal authority documents and audit logs (currently 6 years — `RETENTION_YEARS`). |
| Q11 | Liability allocation if guardian verification is wrong; insurance needs. |
| Q12 | Any reporting obligations when staff see signs of elder abuse or neglect? |
| Q13 | Elder's right of access: guardian-only notes (`notes.private`) are hidden from the elder by policy. Is that permissible where HIPAA applies? |

## 11. Next steps (human action)

- [ ] Engage counsel with healthcare privacy experience; share this memo and CC-9.
- [ ] Decide launch business model (consumer vs. agency) — it changes the answers.
- [ ] Turn each confirmed obligation into a backlog story with acceptance criteria.

# Regulatory Applicability Memo

Notion stories: CC-8 counsel's review of this memo (not started), CC-196 this update
Status: DRAFT v2 for counsel review, updated 2026-11-15 — not legal advice. v1 was written by the product owner from general knowledge on 2026-10-19, before Sprints 11 to 13 added real accounts, Social Security numbers, bank accounts, cards, profile photos, the family chat with voice replies, daily check-ins, supply counts and the evening recap. v2 adds those (§2.1, §10) and questions Q14 to Q25, and was checked against the [data inventory (CC-9)](09-data-inventory.md). No lawyer has reviewed it. Every conclusion below is a working assumption to be confirmed or corrected by qualified counsel before launch or pilot.

## 1. Purpose

Identify which laws likely apply to Circle Care, under which business models, so the backlog includes the right controls and counsel's time is focused on the right questions.

## 2. Product facts relevant to the analysis

- Circle Care stores, for one older adult ("the elder"): medication list and schedule, dose logs (taken/skipped/refused), care tasks, visit check-ins, care notes, uploaded documents (care plans, discharge summaries, legal authority documents), an emergency card (allergies, conditions, directives, blood type), SOS events, daily check-ins, and an access log. See CC-9 data inventory.
- Users: the elder, a verified legal guardian/healthcare POA, family members, professional caregivers (agency-employed or private), and an internal review team that verifies legal documents.
- Channels: in-app, push, SMS, email. Lock-screen and email text is designed to carry no health information (CC-31; Digest email "carries no PHI").
- Since Sprint 11 the prototype has a server and a Postgres database for real accounts: each person's name, contact details, email and password, profile photo and Social Security number, and the legal guardian's bank account and cards (see [Accounts, identity & payments](../wiki/features/accounts-identity-payments.md)). Payments run through a simulated vault, no money moves, and outside production only test numbers are accepted (CC-182). The care circle itself (medicines, chat, check-ins) is still demo data kept in the browser, with fictional people. This memo is about the production product.

### 2.1 Data added since the October draft

Two business models, as in §3: **Consumer**, where a family uses Circle Care on its own, and **Agency**, where a home-care agency that is a HIPAA covered entity provides it to its clients. Each row matches a row of the data inventory's tables for these data types, except voice replies and the account email and password, which come from the code and the Postgres accounts table. Every cell is a working assumption for counsel to confirm.

| Data | Consumer model | Agency model | Working assumption | Questions |
|---|---|---|---|---|
| Social Security number | Applies. Elder, caregiver and guardian accounts all hold one | Applies the same way, including agency caregivers' accounts | Not health data, but state SSN protection and data-security laws and every state's breach law cover it on its own, whatever the model. Collecting it at all needs a stated purpose | Q14, Q15, Q22, Q24 |
| Bank account | Applies. Only the legal guardian adds one, to pay for care by ACH; a guardian's profile isn't complete without one, and the only one can't be removed | Applies if the agency bills families through Circle Care | Payment rules (Nacha, Regulation E) and money transmission law depend on who moves the money; GLBA may apply if Circle Care counts as a financial institution. A guardian paying for care from the elder's money may have to account for it | Q16, Q17, Q22, Q24, Q25 |
| Card | Applies. Only the legal guardian adds cards, up to 5 | Applies if the agency bills through Circle Care | PCI DSS applies by contract with the card brands. The plan is to tokenize with Stripe so full numbers stay out of Circle Care's systems, but the Stripe path isn't built yet: today the development vault receives full test numbers in Circle Care's own server process | Q16, Q17, Q23 |
| Profile photo | Applies to every account | Applies; a full-face photo of a client is likely PHI under a BAA | No face matching is done, so biometric laws likely don't apply today. A photo sent straight to the API keeps its location data (data inventory action) | Q18 |
| Family chat messages | Applies. Free text that can hold health details | Applies once an agency caregiver is added to the chat | Treated as health data: consumer health data under state laws and the HBNR in consumer mode, PHI under a BAA in agency mode, though which messages a BAA covers is unclear (Q3) | Q3, Q12, Q19 |
| Voice replies in chat | Applies when any member speaks a reply; the elder's chat has a large microphone button | Applies, including agency caregivers' replies | Since CC-222 the chat's voice reply listens only when the browser can recognize speech on the device (`processLocally`), like the medicine voice check; otherwise it opens for typing. No audio goes to a speech service and only the text is stored. A future cloud speech option would need the answers to Q20 first | Q20 |
| Daily check-ins | Applies. How the elder feels, water and meals | Applies if caregivers or the agency see them | Consumer health data; the elder chooses whether the guardian sees them, and a day logged while not sharing stays private | Q21 |
| "I'm OK" check-ins | Applies (in the October draft); now with an optional mood | Applies; likely PHI where agency caregivers see them | The mood makes it health data, like the daily check-ins | Q9, Q21 |
| Supply counts | Applies. Pills left and refill requests reveal which medicines the elder takes | Applies; caregivers on shift can see and update them | Health data. The app records that someone asked the pharmacy; it doesn't contact the pharmacy itself | — |
| Help requests | Applies. The legal guardian posts a ride, groceries or a visit with a free-text note, for the family members and caregivers the guardian picks (Sprint 16, CC-209) | Applies once an agency caregiver is picked for a request | Treated as health data like the chat: the note is free text and a request can be tied to an appointment. Lock-screen text carries no health details, and appointment details are hidden from anyone without appointment access | Q3, Q12 |
| Coming Home plans | Applies. The legal guardian plans the first days after a hospital stay and gives items to people in the circle (Sprint 17, CC-213, CC-214) | Applies once an item is given to an agency caregiver | Health data: a plan reveals a hospital stay, though it never records why. Each person sees only the item given to them | Q3, Q12 |
| After-visit notes | Applies. Whoever went to a visit records the doctor's answers and next steps (Sprint 18, CC-218) | Applies; a caregiver who went can write them | Health data like the chat. Readable only while the elder shares appointments; next steps become care tasks | Q3, Q12 |
| Call log | Applies. The elder or the legal guardian records calls with an insurer, a pharmacy or an agency: who they spoke to, what was agreed and a reference number (Sprint 19, CC-226 to CC-228) | Applies once an agency caregiver can see the log; they get only the organization, the date and the next step unless the elder picks them for insurance and admin details | Treated as health data: an insurer's or pharmacy's name and the outcome can reveal care and coverage. Reference numbers show masked and are revealed only to the elder and the guardian, with each reveal in the access history | Q3, Q12 |
| What matters to me | Applies. The elder writes her routines, food she likes and how she wants to be helped, in her own words (Sprint 19, CC-219) | Applies; an agency caregiver sees a section only while on shift and only when the elder picks them | Health data like the chat: it can describe needs and conditions. Each section is private until the elder picks who sees it; no audio is kept | Q3, Q12 |
| Visit questions | Applies. The elder, the guardian, family and caregivers on shift add questions for the elder's doctor (Sprint 17, CC-217) | Applies; caregivers on shift can add and see them | Health data like the chat. The elder can hide an item so only she and the guardian see it | Q3, Q12 |
| Memory aids | Applies. The legal guardian and family write short notes, with an optional photo, shown on the elder's home and read aloud (Sprint 22, CC-138, CC-139) | Applies; caregivers on shift can read them but not write them | Treated as health data: a note to help someone remember says something about their memory. Notes that look like a PIN, door code or password are refused, and the elder can turn any note off | Q3, Q12 |
| Scam reports | Applies. The elder taps "Is this a scam?" and can add a short note or a photo; only guardians see it (Sprint 22, CC-132, CC-133) | Applies the same way; agency caregivers never see a report | The note or photo may hold account or card details, so it is handled as sensitive financial data: kept out of the access log and the photo deleted 30 days after the report is resolved. Circle Care names where to report a scam but never contacts a bank or agency itself | Q16, Q22 |
| Resting and away days | Applies. The elder marks a day as resting or away so missed check-ins don't alarm the family (Sprint 22, CC-129) | Applies if the agency sees check-ins | Personal data, not health data: no reason is asked or kept. It says when the elder may not be home, so it is shown only to the circle | — |
| Evening recap | Applies; only the legal guardian sees it | Applies the same way | Nothing new is stored; it is worked out each time from data above. Its alert text carries no health details | Q21 |
| Account email and password | Applies to every account | Applies to agency staff accounts too | Several states' breach laws treat an email plus its password as breach-triggering data on its own. Passwords are stored only as hashes | Q22 |

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
- **HBNR (16 CFR Part 318):** applies to vendors of personal health records and related entities **not** covered by HIPAA. As amended (2024), it is understood to cover health apps that draw information from multiple sources; Circle Care draws from the elder, caregivers and family (now also through the chat, voice replies and daily check-ins), and possibly device/health integrations later. A "breach" includes unauthorized disclosures, not only hacks — e.g., sharing with an analytics vendor without authorization.
- Implication: in consumer mode, a breach could require notice to individuals, the FTC and possibly media. Timelines differ from HIPAA. Counsel to confirm (Q4). Sending voice audio to a speech service without authorization could itself count as a breach under this definition (Q20).
- New promises to track: "ACH bank transfers have no platform fee", and that SSNs and full bank and card numbers are never shown or stored in full.
- The chat's voice sheet says "Your words are turned into text on this device". Since CC-222 the code makes that true: the chat asks for on-device recognition and opens for typing where the device can't do it. Keep the wording and the code together (a test fails if they drift).

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
| State SSN protection laws (e.g., California, Connecticut, Michigan, New York) | Circle Care collects SSNs from elders, caregivers and guardians | Limits on displaying, mailing and transmitting SSNs; some states require a published SSN privacy policy. Today the full number is never shown and is stored only encrypted (CC-180, CC-181). Confirm which states need a policy (Q14) |
| State biometric privacy laws (e.g., Illinois BIPA, Texas, Washington) | Only if profile photos or voice are ever used to recognize a person | No face or voice matching today; consent would be needed before any is added (Q18, Q20) |
| State data-security laws (e.g., Massachusetts 201 CMR 17.00, New York SHIELD Act) | Circle Care holds residents' SSNs and bank account details | A written information security program, vendor oversight and encryption duties, whatever the health-law answer (Q24) |
| State money transmission laws | Only if Circle Care itself holds or moves money between the guardian and caregivers or agencies | Use a licensed processor that holds the funds; confirm the structure before money moves (Q16) |

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

## 10. Payments, SSNs and identity data (added 2026-11-15)

- **Why SSNs are collected.** Sign-up asks every account for an SSN to verify identity, but nothing verifies it yet: no identity-check vendor is connected, and the app only checks the format and that the SSN isn't on another account. Collecting it for elders, caregivers and guardians alike needs a purpose counsel agrees with. If it is used for caregiver background checks through a vendor, the Fair Credit Reporting Act may apply, with its own consent and adverse-action steps (Q14, Q15).
- **Controls in place today** (see the data inventory): SSNs are stored only encrypted, with a separate fingerprint to stop one SSN on two accounts; bank and card numbers go only to the vault and Circle Care keeps a token and the last four; audit records keep the last four only; real values are refused outside production (CC-180 to CC-188).
- **Gaps already in the backlog** (from the [threat model (CC-10)](../security/10-threat-model.md)): no second sign-in step on the server for accounts that hold an SSN and bank details (CC-200); no way to end every session or reset a password (CC-201); a signed-in account can learn whether an SSN is already registered (CC-204); the database connection doesn't verify the server's certificate (CC-203).
- **Who moves the money.** "Pay for care by ACH" can mean Circle Care debits the guardian and pays a caregiver or agency. That may make it a money transmitter, or a financial institution under GLBA and the FTC Safeguards Rule, unless a licensed processor holds and moves the funds (Q16). ACH debits need the guardian's authorization under Nacha rules and Regulation E, and recurring card charges may fall under state automatic-renewal laws (Q17).
- **Paying from the elder's money.** A guardian or agent under a power of attorney who pays for care from the elder's funds usually has a duty to keep records and account for that spending, and some courts require yearly accountings. Circle Care could help with receipts, but shouldn't suggest it meets a court's rules (Q25).
- **Paying caregivers.** If a family pays a private caregiver through Circle Care, tax and worker-classification duties (for example household employment) may arise for the family; Circle Care should not give tax advice. A question for counsel before money moves, not a product promise.

## 11. Open questions for counsel

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
| Q14 | Do we need an SSN from every account at all, and for what purpose? Which state SSN laws apply (published SSN privacy policy, limits on display and transmission), and could identity be verified without one? |
| Q15 | If SSNs are used for caregiver background checks or identity checks through a vendor, does the FCRA apply, and what consent and adverse-action steps are needed? |
| Q16 | Does holding guardians' bank and card details, or moving money for care, make Circle Care a financial institution under GLBA and the FTC Safeguards Rule, or a money transmitter under state law and FinCEN rules? Does using a licensed processor that holds the funds avoid that? |
| Q17 | What ACH authorization (Nacha rules, Regulation E) and card terms do we need, do state automatic-renewal laws apply to recurring charges, and is "no platform fee" a safe public claim? |
| Q18 | Is a profile photo PHI in the agency model? Would any later face matching bring in state biometric laws, and what consent would that need? |
| Q19 | Family chat: when an agency caregiver is in the chat, which messages are PHI under the BAA? What retention, deletion and legal-hold rules apply to chat, and may a caregiver keep seeing messages after leaving the circle? |
| Q20 | Voice replies: both voice features now recognize speech on the device only (CC-73, CC-222). Please confirm that on-device recognition, where no audio leaves the phone, needs no BAA or consent. If a cloud speech option is ever added, is sending a member's voice to that service a disclosure that needs a BAA (agency) or consent (consumer, MHMDA), or a breach under the HBNR? |
| Q21 | The elder can keep daily check-ins private from the guardian. Can a guardian with healthcare authority override that, and must the evening recap respect it? |
| Q22 | Which state breach laws do SSNs, financial account numbers and an email with its password trigger, alongside HIPAA and the HBNR, and what notice timelines follow (CC-34)? |
| Q23 | With card numbers entered in Stripe's own fields, is Circle Care's PCI DSS scope the smallest self-assessment (SAQ A), and what does it become if card numbers ever pass through our server, as the development vault does today (SAQ D)? |
| Q24 | Do state data-security laws such as Massachusetts 201 CMR 17.00 and the New York SHIELD Act apply to us, and what must our written security program include? |
| Q25 | When a guardian or agent pays for care from the elder's money through Circle Care, what records must they keep, and should the app help without claiming to meet a court's accounting rules? |

## 12. Next steps (human action)

- [ ] Engage counsel with healthcare privacy experience, and payments and consumer-finance experience for §10; share this memo and CC-9.
- [ ] Decide launch business model (consumer vs. agency) — it changes the answers.
- [ ] Decide who holds and moves money for care before any real payment (Q16).
- [ ] Turn each confirmed obligation into a backlog story with acceptance criteria.

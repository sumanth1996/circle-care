# Data Inventory

Notion story: CC-9 Data inventory and classification
Status: DRAFT v4, reviewed against `main` on 2026-11-15 (demo state version 11, the 11 Postgres tables and 2 masked views in `server/migrations/001_init.sql`, and the `schema_migrations` log). v3 and v4 follow two Lead Architect review rounds the same day: the access logs are PHI and sensitive, not operational; readable ids are PHI; and the field check reads the database catalog and the live demo data as well as `types.ts`. v1 was written on 2026-10-19, before Sprints 11 to 13 added accounts, SSNs, bank accounts, cards, profile photos, everyday care and the family chat. Retention and production storage still describe the **intended** design and need sign-off by the security officer and counsel (CC-8, CC-79). All people in the prototype are fictional.

## How this inventory stays true

The classes live in code, in [`src/data/classification.ts`](https://github.com/sumanth1996/circle-care/blob/main/src/data/classification.ts). A unit test, `src/__tests__/classification.test.ts`, fails, naming the field, when:

- a state field in `src/data/types.ts` has no class, or a classified one no longer exists. The reader refuses any declaration or field shape it can't parse (an object inside a union, say) instead of skipping it, and checks its own count of fields;
- a field in the live demo data (`seed()`, after the alert rules run) has no class. This second check doesn't depend on reading `types.ts`;
- a column has no class. The test runs every migration on an in-memory Postgres and lists, from Postgres's own catalog, the columns of every table, view, materialized view and foreign table in every schema, so it sees what the database has, however the SQL was written;
- a record that holds PHI tags who or when as anything but PHI (see the rules below);
- this document's field tables (below) list a field under a different class than the code, or list an entity twice.

So a new field can't reach `main` without a class here. Re-run the review, and update the status line, whenever a story adds data.

## Classification key

| Class | Meaning | Handling |
|---|---|---|
| **PHI** | Health information about Maggie, or something that reveals it (a medicine, a dose, a care task, a visit, a feeling). Legally PHI only where HIPAA applies (CC-8); treated as PHI everywhere by design, and as consumer health data under state laws. | Encrypted at rest and in transit; role-checked by `can()` (CC-18/19); never in lock-screen text, email, SMS, server or debug logs, or analytics. The circle's access log can name medicines and documents, so it is protected as PHI |
| **PII** | Identifies a person but says nothing about health on its own: names, phone, email, photo, relationship | Encrypted; owner or circle only; not in analytics |
| **Sensitive financial or identity** | SSNs, bank and card details, payment tokens, password hashes | Never stored in plain text: SSNs only as ciphertext, bank and card numbers only as a vault token and last four; never returned in full by the API; writes audit-logged with last four only; real values refused outside production (CC-182) |
| **Operational** | Ids, timestamps, settings and flags needed to run the service | May appear in security logs by id only |

Two rules keep the tags consistent, and the test checks both:

- **Who and when go with the record.** In a record that holds PHI, the member who did it and the time are PHI too, because together they say who cared for Maggie, and when. Each nested object counts as its own record, and a link to another record doesn't make it one, so the chat's read times stay operational though its messages are PHI. This rule doesn't by itself make an id, a status or a flag PHI. The test goes by field name (`by`, `at`, `…By`, `…At` and a short list of member references), so new who or when fields should follow that naming.
- **Demo ids are readable.** They embed what they are about: `med-lisinopril`, `t-bath`, `ap-metformin`, `s-ana` for a caregiver's shift, `appt-auto-med-lisinopril-…` for an automatic refill, and `b-` plus the count time for a bottle. So `Medication.id`, `CareTask.id`, `Approval.id`, `Shift.id`, `Appointment.id`, `MedSupply.bottleId`, the fields that hold those ids and alert keys built from them are PHI. Production should use opaque ids.

"Who can see" names the permission-matrix resource (`MATRIX` in `src/data/policy.ts`, rendered in the [permission matrix](../security/permission-matrix.md)) and the roles that may read it. `pro@shift` is a paid caregiver while checked in to a visit. When Maggie pauses sharing (CC-81), family and paid caregivers keep only `sos`, `emergencyCard` and `circle`.

## Where data lives

| Store | Today (verified in code) | Production (intended) |
|---|---|---|
| Demo circle state (`State`) | Browser `localStorage["circle-care-demo"]`, AES-256-GCM, fresh IV per save, `enc:v1:<iv>:<ct>`; key is a non-extractable CryptoKey in IndexedDB `circle-care-keys` (CC-26). Plain JSON only if Web Crypto or IndexedDB is missing. | Server database behind the same `can()` policy |
| Document files | IndexedDB `circle-care-files`, each file AES-GCM encrypted (CC-67); PDF, PNG or JPEG by magic bytes; 10 MB limit | Object storage, encrypted, malware scan, short-lived signed URLs |
| Accounts, identity and payments | Postgres (`DATABASE_URL`, or an embedded Postgres in `.data/` for development). Field-level AES-256-GCM `v1.<keyId>.<iv>.<tag>.<ct>` with keys outside the database (`server/crypto.ts`); production refuses to start without them (CC-183) | Same, managed keys with rotation |
| Payment vault | Simulated vault (`server/vault.ts`), test values only, never in production | Stripe: full numbers go to Stripe, Circle Care keeps tokens |
| Exports | `.ccexport`, PBKDF2-SHA256 (250,000 iterations) to AES-256-GCM, user passphrase (CC-32); masked audit export `npm run audit:export` (CC-184) | Same |
| Deletion log | `localStorage["circle-care-deletions"]`, timestamps only | Minimal deletion record |
| Pilot data | `localStorage["circle-care-pilot-leads"]`, `["circle-care-nps"]`, apart from circle state | Separate research store, no join key |
| NPS prompt dismissal | `sessionStorage["cc-nps-dismissed-<persona>"]` | Same, device only |

## SSNs, bank accounts, cards and profile photos

| Data | Where it is stored | How it is protected | Who can write | Who can read |
|---|---|---|---|---|
| Social Security number | `elders`, `caregivers` or `guardians`: `ssn_enc` (ciphertext) and `ssn_last4`; `ssn_fingerprints.fingerprint` (HMAC-SHA256 with a separate key) to stop one SSN on two accounts; the last four in `audit_events.detail` when it is set or changed | AES-256-GCM with a key version prefix; the full number is decrypted only to check a change, never returned (CC-180, CC-181) | The account holder, `PUT /api/me/ssn`; changing it needs the password again | Nobody in full. The owner sees `•••-••-1234`; the masked audit export and `audit_people_masked` show the same |
| Bank account | Vault token in `bank_accounts.vault_token` and `vault_tokens`; bank name, holder name, type, last four of account and routing; the last four in `audit_events.detail` | Full numbers go to the vault and are discarded; CHECK constraints allow only four digits in the last-four columns (CC-186) | The legal guardian only (`/vault/v1`, then `/api/me/payment-methods`; others get 403). One per guardian: a new one deletes the old row and inserts the new one in one transaction, and removing the only account is refused (409) | The guardian, as last four; masked audit export |
| Card | Vault token in `payment_cards.vault_token` and `vault_tokens`; holder name, brand, funding, last four, expiry, primary flag; brand and last four in `audit_events.detail` | The full number and security code reach only the vault endpoint and are never stored. In development the simulated vault runs in the same server process; in production they go to Stripe and never reach Circle Care (CC-187, CC-188) | The legal guardian only; at most 5 cards | The guardian, as brand and last four; masked audit export |
| Profile photo | `photos.data_enc`, at most 2 MB | Resized to 512 px and re-encoded as JPEG in the browser, which drops location and camera data. The server checks the file signature (JPEG, PNG or WebP) and encrypts it but doesn't re-encode, so a photo sent straight to the API keeps its metadata (CC-179) | The account holder | The account holder only, `Cache-Control: private, no-store`. Demo members' photos (`Member.photo`) are fictional images |

## Chat, check-ins, supply counts and the evening recap

| Data | Can it hold health details? | Who can see it |
|---|---|---|
| Family chat messages (`ChatMessage.text`) | **Yes.** It is free text. The health-detail check (`phiHint`, CC-164, CC-192) warns and offers Save as a note, but the sender can still choose Send anyway, so text is PHI. Message alerts say only "{name} wrote in the family chat." | `chat`: Maggie, Sarah and family; a paid caregiver only once Maggie or Sarah adds them, and only messages from when they joined. Hidden from family and caregivers while sharing is paused |
| Daily check-ins (`DailyLog`: feeling, water, meals) | **Yes.** They describe how Maggie feels and eats | `wellbeing`: Maggie; Sarah only while Maggie shares them and sharing isn't paused. A day logged while not sharing stays private |
| "I'm OK" check-ins (`Checkin`) | **Yes**, the optional mood | `history`: Maggie, Sarah and family |
| Supply counts (`MedSupply`) | **Yes.** Pills left and refill requests reveal which medicines Maggie takes | `supply`: Maggie, Sarah, family, and a paid caregiver while on shift. Refill alerts name the medicine only in the in-app detail |
| Evening recap | **Yes**, but nothing is stored: `recap()` in `src/data/everyday.ts` works it out from doses, tasks, shifts and visits, check-ins, daily logs, supply counts, appointments and unread chat each time it is shown. `settings.recapNotify` is the only stored field | Sarah only, because the card is shown only on her Home (from 6 PM); no `can()` check guards it. Her day shows as Private when Maggie isn't sharing. The 7 PM alert's lock-screen title is "Update from Circle Care" and its detail is "Your evening recap is ready." |

## Field tables

Each row lists every field of one entity by class; inline objects use dots (`pill.color`). The test checks these rows against `src/data/classification.ts`.

### Demo state (`src/data/types.ts`)

| Entity | PHI | PII | Sensitive financial or identity | Operational | Who can see |
|---|---|---|---|---|---|
| `State` | `health.heightCm`, `health.overrides.at`, `health.overrides.hr`, `health.overrides.spo2`, `health.overrides.addedAt` | `health.birthYear` | — | `version`, `persona`, `signedIn`, `clockOffsetMin`, `elderId`, `health.device` | `health` goes with `vitals`: Maggie, Sarah (while Maggie shares) |
| `Member` | — | `name`, `short`, `role`, `relation`, `phone`, `photo`, `verification` | — | `id`, `color`, `status`, `expiresOn`, `favorite`, `invitedAt` | `circle`: elder, guardian, family, pro. `relation` and `verification` can reveal legal authority |
| `Medication` | `id`, `name`, `strength`, `dose`, `times`, `instructions`, `prescriber`, `purpose`, `critical`, `paused`, `pill.color`, `pill.shape`, `history.at`, `history.by`, `history.change` | — | — | — | `meds`: elder, guardian, family, pro@shift. Never on the lock screen (CC-31). `id` embeds the drug name |
| `MedSupply` | `count`, `countedAt`, `perDose`, `bottleId`, `requestedAt`, `requestedBy`, `pharmacy` | — | — | — | `supply`: elder, guardian, family, pro@shift |
| `DoseLog` | `medId`, `date`, `time`, `status`, `by`, `at`, `verified`, `reason` | — | — | `id` | `doses`: elder, guardian, family, pro@shift. `reason` is free text |
| `CareTask` | `id`, `title`, `icon`, `time`, `recurrence`, `assignee` | — | — | — | `tasks`: elder, guardian, family, pro@shift. Titles reveal care needs |
| `TaskLog` | `taskId`, `date`, `by`, `at`, `note` | — | — | — | `tasks`: elder, guardian, family, pro@shift |
| `Shift` | `id`, `caregiverId`, `days`, `start`, `end` | — | — | `accepted` | `schedule`: elder, guardian, family, pro. Reveals that Maggie gets home care |
| `Visit` | `shiftId`, `caregiverId`, `date`, `checkIn`, `checkOut`, `manualReason` | — | — | `id` | `schedule`: elder, guardian, family, pro. No location is stored |
| `Handoff` | `by`, `at`, `mood`, `meals`, `concerns`, `notes`, `summary`, `acknowledgedBy`, `acknowledgedAt`, `skippedReason` | — | — | `id`, `visitId` | `handoffs`: guardian, family, pro; written only by a caregiver on shift |
| `SosEvent` | `startedAt`, `status`, `responderId`, `acknowledgedAt`, `resolvedAt`, `outcome` | — | — | `id`, `step`, `via` | `sos`: elder, guardian, family, pro, even while sharing is paused |
| `Checkin` | `date`, `at`, `mood` | — | — | — | `history`: elder, guardian, family |
| `DailyLog` | `date`, `feeling`, `feelingAt`, `water`, `meals`, `updatedAt` | — | — | `private` | `wellbeing`: elder; guardian while Maggie shares |
| `ChatMessage` | `by`, `at`, `text` | — | — | `id`, `via` | `chat`: elder, guardian, family, and pros once added |
| `Chat` | — | — | — | `pros`, `readAt`, `joinedAt` | `chat`: elder, guardian, family, and pros once added |
| `Approval` | `id`, `title`, `detail`, `requestedBy`, `at`, `decidedAt`, `note`, `payload`, `elderQuestion` | — | — | `kind`, `status`, `elderSeen` | `approvals`: elder, guardian. `payload` holds proposed medicine values |
| `CareNote` | `by`, `at`, `text` | — | — | `id`, `visibility` | `notes`: elder, guardian, family, pro@shift; guardian-only notes (`notes.private`): guardian |
| `CareDoc` | `name`, `kind`, `by`, `at`, `rejectReason` | — | — | `id`, `size`, `status`, `fileId`, `mime` | `docs`: elder, guardian, family, pro@shift; legal documents (`docs.legal`): elder, guardian. File names can hold diagnoses; `rejectReason` is the reviewer's free text |
| `AuditEvent` | `at`, `actorId`, `resource` | — | — | `id`, `action`, `prev`, `hash` | `audit`: elder, guardian. `resource` names what was opened or changed, often a medicine, a document or an appointment, so the log is PHI. Hash-chained (CC-28) |
| `Alert` | `key`, `at`, `detail` | — | — | `id`, `to`, `title`, `severity`, `read`, `link` | The personas in `to`. `title` is the lock-screen text and never holds health details; `key` embeds medicine ids and vitals metrics |
| `Appointment` | `id`, `date`, `time`, `durationMin`, `kind`, `title`, `provider`, `location`, `medIds`, `escortId`, `prep`, `createdBy` | — | — | `status`, `autoCancelled` | `appointments`: elder, guardian, family, pro |
| `Settings` | `consent.at`, `consent.by`, `consent.onBehalfReason`, `vitals.thresholds.hrHigh`, `vitals.thresholds.hrLow`, `vitals.thresholds.hrJump`, `vitals.thresholds.spo2Low`, `vitals.thresholds.spo2Drop`, `emergencyCard.allergies`, `emergencyCard.conditions`, `emergencyCard.directives`, `emergencyCard.bloodType`, `emergencyCard.approvedAt` | — | — | `checkinWindow.start`, `checkinWindow.end`, `escalation`, `escalationDelayMin`, `doseEscalation.caregiverMin`, `doseEscalation.guardianMin`, `quietHours.on`, `quietHours.start`, `quietHours.end`, `channels.push`, `channels.sms`, `channels.email`, `criticalBypass`, `textSize`, `highContrast`, `readAloud`, `sharingPaused`, `consent.version`, `sessionLockMin`, `elderLockMin`, `toured`, `setupCallRequested`, `vitals.intervalMin`, `vitals.shareWithGuardian`, `refillAlertDays`, `dailyLog.shareWithGuardian`, `dailyLog.waterGoal`, `dailyLog.sharedSince`, `recapNotify`, `elderChatOnHome`, `emergencyCard.approvedByElder` | `settings`: elder, guardian; `emergencyCard`: elder, guardian, family, pro. Accessibility settings are operational but can imply vision or hearing needs |

### Postgres (`server/migrations`)

The accounts API serves each person only their own rows (`requireUser`); payment tables are guardian-only. `audit_events` is append-only (a trigger blocks UPDATE and DELETE), and an auditor's read-only role should get only the masked views `audit_people_masked` and `audit_payment_methods_masked`.

| Entity | PHI | PII | Sensitive financial or identity | Operational | Notes |
|---|---|---|---|---|---|
| `users` | — | `email` | `password_hash` | `id`, `role`, `failed_attempts`, `first_failed_at`, `locked_until`, `created_at`, `updated_at` | scrypt hash with a per-user salt (CC-173) |
| `sessions` | — | — | `token_hash` | `user_id`, `created_at`, `last_seen_at`, `expires_at` | SHA-256 of the cookie token, which works as a credential; the token itself is never stored. Expired rows stay until that cookie comes back, on sign-out, or on a lock-out at the password check before an SSN change |
| `elders` | — | `first_name`, `last_name`, `phone`, `email` | `ssn_enc`, `ssn_last4` | `id`, `user_id`, `created_at`, `updated_at` | Owner only |
| `caregivers` | — | `first_name`, `last_name`, `phone`, `email` | `ssn_enc`, `ssn_last4` | `id`, `user_id`, `created_at`, `updated_at` | Owner only |
| `guardians` | — | `first_name`, `last_name`, `phone`, `email` | `ssn_enc`, `ssn_last4` | `id`, `user_id`, `created_at`, `updated_at` | Owner only |
| `ssn_fingerprints` | — | — | `fingerprint` | `user_id` | HMAC-SHA256, separate key; read only to detect a duplicate SSN, never returned |
| `photos` | — | `data_enc` | — | `user_id`, `content_type`, `size_bytes`, `updated_at` | Encrypted image; owner only |
| `vault_tokens` | — | — | `token`, `metadata` | `kind`, `owner_user_id`, `created_at`, `attached_at`, `revoked_at` | Simulated vault, not in production. `metadata` holds the holder name, bank name, account type and last four of account and routing, or the brand, brand label, funding, last four and expiry |
| `bank_accounts` | — | `holder_name` | `vault_token`, `bank_name`, `account_type`, `account_last4`, `routing_last4` | `id`, `user_id`, `ach_fee_cents`, `created_at` | Guardian only; one per guardian |
| `payment_cards` | — | `holder_name` | `vault_token`, `brand`, `funding`, `last4`, `exp_month`, `exp_year` | `id`, `user_id`, `is_primary`, `created_at` | Guardian only; one primary |
| `audit_events` | — | — | `detail` | `id`, `at`, `actor_user_id`, `subject_user_id`, `action` | `detail` holds SSN, bank and card last fours, card brands and the export operator's name, so it is sensitive. It is masked by the caller, and `audit()` refuses a standalone run of 9 or more digits or a dashed SSN |
| `schema_migrations` | — | — | — | `version`, `applied_at` | Created by `server/migrate.ts` |
| `audit_people_masked` | — | `name_masked`, `email_masked`, `phone_masked` | `ssn_masked` | `user_id`, `role`, `created_at` | View for auditors: first name and last initial, masked email and phone, `•••-••-` and last four |
| `audit_payment_methods_masked` | — | — | `label`, `detail`, `number_masked`, `routing_masked` | `user_id`, `kind`, `is_primary`, `fee_cents`, `created_at` | View for auditors: bank or brand, type or funding, last fours only |

## Retention and deletion (intended)

- **Close the circle** (elder or guardian, `data.delete`): the prototype wipes circle state, destroys the device key and clears the file store (`wipeDevice`, CC-33), so any leftover copy is unreadable. Production: delete within 30 days (as `/privacy` promises), including backups on their normal rotation.
- **Delete an account:** persona, session, photo, fingerprint, vault token, bank and card rows go with the `users` row (`ON DELETE CASCADE`). `audit_events` has no foreign key, so it keeps the masked history. There is no account-deletion endpoint yet, so today this happens only by deleting the row directly. Confirm the design with counsel.
- **Audit logs:** at least 6 years (`RETENTION_YEARS = 6` in `src/data/audit.ts`). The circle's access log names medicines and documents (PHI) and the server log keeps last fours (sensitive), so both are protected like the data they describe. Confirm with counsel (CC-8 Q10).
- **Sessions:** expire after 12 hours, but nothing purges expired rows yet: each is deleted only when its cookie comes back, on sign-out, or on a lock-out at the password check before an SSN change (a sign-in lock-out leaves existing sessions in place). A purge job is needed before production.
- **Member removed or time limit ends (CC-25):** access stops at once; what they wrote stays with the circle as part of Maggie's care record.

## Pilot data: separate, non-PHI store (`src/lib/pilot.ts`)

| Element | Fields kept | Class | Source | Who can see | Retention |
|---|---|---|---|---|---|
| Pilot lead | `at`, `role`, `state` (trimmed to 30 characters), `hasPro` | De-identified | `/pilot` form | Pilot team; totals on `/app/pilot` | Until pilot recruiting ends |
| Lead name and contact | **Not stored** (the form asks, `addPilotLead` drops them) | PII | `/pilot` form | — | Production needs a separate store, deleted after the pilot |
| NPS response | `at`, `persona`, `score`, `comment` (health words removed by `scrubHealth`, at most 500 characters) | De-identified (best effort) | In-app feedback (CC-76) | Pilot team; groups under 5 hidden (`MIN_COHORT`) | 12 months after the pilot ends (CC-74) |

`scrubHealth` is a keyword filter, not a guarantee, so comments are reviewed before they are quoted. The pilot dashboard shows synthetic data in the prototype.

## Human actions

- [ ] Security officer and counsel confirm the classes, retention periods and the audit-log exception.
- [ ] Decide whether `relation`, `verification` and the accessibility settings (operational here, though they can imply vision or hearing needs) are treated as PHI.
- [ ] Use opaque ids in production, so ids and alert keys stop naming medicines, tasks and approvals.
- [ ] Re-encode profile photos on the server too, so a photo sent straight to the API loses its location data.
- [ ] Add a job that purges expired sessions.
- [ ] Decide whether `health.birthYear` stays PII or becomes PHI once it sits next to health readings.
- [ ] Define the production store for pilot contact details.
- [ ] Update this inventory, and its status line, whenever a story adds data (the classification test will fail until it does).

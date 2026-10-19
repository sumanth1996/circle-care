# Data Inventory

Notion story: CC-9 Data inventory and classification
Status: DRAFT v1 — derived from the code in `src/data/types.ts`, `src/lib/pilot.ts`, `src/lib/secureStorage.ts` and `src/data/store.tsx` as of 2026-10-19. Production storage, retention and deletion columns describe the **intended** design and need sign-off by the security officer and counsel (CC-8, CC-79).

## Classification key

| Class | Meaning | Handling |
|---|---|---|
| **PHI** | Health information about the elder that identifies her. Legally PHI only where HIPAA applies (CC-8); treated as PHI everywhere by design. Also "consumer health data" under state laws. | Encrypted at rest and in transit; role-checked (CC-18/19); every view logged (CC-28); never in notifications, email, SMS, logs or analytics |
| **PII** | Identifies a person (any circle member) but is not health information on its own | Encrypted; role-checked; not in analytics |
| **Operational** | Settings, IDs, timestamps, security events needed to run the service | Encrypted with the circle; may appear in security logs by ID only |
| **De-identified** | Cannot reasonably identify a person; aggregated or stripped | Kept apart from circle data; small-cohort suppression |

"Who can see" names the resource in the permission matrix — see [security/permission-matrix.md](../security/permission-matrix.md).

## Storage today (prototype) vs. production

| Store | Prototype (verified in code) | Production (intended) |
|---|---|---|
| Circle state (`State`) | `localStorage["circle-care-demo"]`, AES-256-GCM, fresh IV per save, format `enc:v1:<iv>:<ct>`; key is a non-extractable CryptoKey in IndexedDB `circle-care-keys` (CC-26). Falls back to plain JSON if Web Crypto/IndexedDB is unavailable. | Managed database, encrypted at rest with managed, rotated keys; TLS in transit; server-side policy checks |
| Document files | IndexedDB `circle-care-files`, each file AES-GCM encrypted (CC-67); PDF/PNG/JPEG by magic bytes; 10 MB limit | Object storage, encrypted, malware scan before storage, signed short-lived URLs |
| Exports | `.ccexport` file, PBKDF2-SHA256 (250,000 iterations) → AES-256-GCM, user passphrase (CC-32) | Same format, generated server-side or on device |
| Deletion log | `localStorage["circle-care-deletions"]`: timestamps only | Minimal deletion record |
| Pilot data | `localStorage["circle-care-pilot-leads"]`, `["circle-care-nps"]` — separate from circle state | Separate research database, no join key to circle data |
| NPS prompt dismissal | `sessionStorage["cc-nps-dismissed-<persona>"]` | Same (device only) |

## Retention and deletion (intended)

- **Close the circle** (elder or guardian, `data.delete`): prototype wipes circle state, destroys the device key and clears the file store (`wipeDevice`, CC-33), so any leftover copy is unreadable. Production: delete within 30 days (as promised on `/privacy`), including backups on their normal rotation.
- **Audit log:** kept at least 6 years (`RETENTION_YEARS = 6` in `src/data/audit.ts`) — minimal entries only (IDs, action, resource name). Confirm with counsel (CC-8 Q10).
- **Member removed / time limit ends (CC-25):** access stops immediately; their authored records stay with the circle (they are part of the elder's care record).

## Entity tables

### State (root)

| Field | Class | Source | Notes |
|---|---|---|---|
| `version`, `clockOffsetMin` | Operational | App | Demo clock offset is prototype-only |
| `persona`, `signedIn` | Operational | App | Session state; production uses server sessions |
| `elderId` | PII (pointer) | App | — |

### Member (`members`) — who can see: `circle`

| Field | Class | Source | Retention / deletion |
|---|---|---|---|
| `id` | Operational | App | Kept in audit log by ID after deletion of circle |
| `name`, `short`, `phone`, `photo` | PII | Inviter / member | Deleted with circle |
| `role`, `relation` | PII | Inviter | Relation (e.g., "Healthcare power of attorney") can reveal legal status |
| `color`, `favorite` | Operational | App / elder | — |
| `status`, `invitedAt`, `expiresOn` | Operational | Inviter / rules | Time-bound access auto-revokes (CC-25) |
| `verification` | PII (legal status) | Review team | Verified/pending/none (CC-23/24) |

### Medication (`meds`) — who can see: `meds`

| Field | Class | Source | Notes |
|---|---|---|---|
| `name`, `strength`, `dose`, `times`, `instructions`, `purpose`, `prescriber` | PHI | Guardian/elder entry; proposals from family or on-shift caregiver need approval | Never shown on lock screen (CC-31) |
| `critical`, `paused` | PHI | Guardian | High-priority flag (CC-43) |
| `pill` (color, shape) | PHI | Guardian | Helps identification; still health info |
| `history[]` (at, by, change) | PHI | App | Change history (CC-37) |

### DoseLog (`doses`) — who can see: `doses`

| Field | Class | Notes |
|---|---|---|
| `medId`, `date`, `time`, `status` (taken/skipped/refused), `reason` | PHI | `reason` is free text — may contain anything |
| `by`, `at`, `verified` | PHI (links person to care event) | `verified` = caregiver-verified during visit (CC-41) |

### CareTask / TaskLog (`tasks`, `taskLogs`) — who can see: `tasks`

| Field | Class | Notes |
|---|---|---|
| `title`, `icon`, `time`, `recurrence`, `assignee` | PHI (reveals care needs, e.g., "shower help") | — |
| TaskLog `date`, `by`, `at`, `note` | PHI | `note` free text |

### Shift / Visit (`shifts`, `visits`) — who can see: `schedule`

| Field | Class | Notes |
|---|---|---|
| Shift `caregiverId`, `days`, `start`, `end`, `accepted` | PII / operational | Reveals that the elder receives home care → treat as PHI in production |
| Visit `date`, `checkIn`, `checkOut`, `manualReason` | PHI (care event) | Door check-in location is **not stored** in the type today; if added, it is precise location → sensitive under state law (CC-8 Q6) |

### Handoff (`handoffs`) — who can see: no dedicated matrix resource yet (gap: `submitHandoff` is not routed through `can()` in the prototype; add a `handoffs` resource — see permission matrix "Coverage gaps")

| Field | Class | Notes |
|---|---|---|
| `mood`, `meals`, `concerns`, `notes`, `summary` | PHI | Free text; auto-drafted summary (CC-82) |
| `by`, `at`, `acknowledgedBy/At`, `skippedReason` | PHI / operational | Acknowledgment (CC-59) |

### SosEvent (`sos`) — who can see: `sos` (always shared, even when paused)

| Field | Class | Notes |
|---|---|---|
| `startedAt`, `status`, `step`, `responderId`, `acknowledgedAt`, `resolvedAt`, `outcome`, `via` | PHI | `outcome` free text; `via` app or SMS fallback |

### Checkin (`checkins`) — who can see: `history`

| Field | Class | Notes |
|---|---|---|
| `date`, `at`, `mood` | PHI | Mood is health-adjacent |

### Approval (`approvals`) — who can see: `approvals`

| Field | Class | Notes |
|---|---|---|
| `kind`, `title`, `detail`, `payload` | PHI (med changes) / PII (member, shift swap) | `payload` holds proposed values |
| `requestedBy`, `at`, `status`, `decidedAt`, `note`, `elderSeen`, `elderQuestion` | PHI / operational | Elder sees decisions (CC-65) |

### CareNote (`notes`) — who can see: `notes` or `notes.private`

| Field | Class | Notes |
|---|---|---|
| `text` | PHI | Free text — highest risk of over-sharing |
| `visibility` (everyone / guardian) | Operational | "guardian" notes map to `notes.private`; the elder cannot read them (see CC-8 Q13) |
| `by`, `at` | Operational | — |

### CareDoc (`docs`) — who can see: `docs`; legal docs: `docs.legal`

| Field | Class | Notes |
|---|---|---|
| `name`, `kind`, `size`, `mime`, `fileId` | PHI (care plan, discharge summary) / PII (legal authority) | File names can contain diagnoses — consider renaming on upload |
| File bytes | PHI / PII (legal) | Encrypted at rest; watermarked viewer, each view logged (CC-67) |
| `status`, `rejectReason` | Operational | Set by reviewer (CC-24) |

### AuditEvent (`audit`) — who can see: `audit`

| Field | Class | Notes |
|---|---|---|
| `id`, `at`, `actorId`, `action`, `resource`, `prev`, `hash` | Operational (security) | Holds identifiers and resource names only — never health values (`src/data/audit.ts`). Hash-chained (CC-28). Retained 6 years. Not deleted with circle (minimal). |

### Alert (`alerts`)

| Field | Class | Notes |
|---|---|---|
| `title` | Operational | PHI-free lock-screen text by rule (CC-31) |
| `detail` | PHI | In-app only, after unlock |
| `to`, `severity`, `read`, `link`, `key`, `at` | Operational | — |

### Settings (`settings`) — who can see: `settings`; emergency card: `emergencyCard`

| Field | Class | Notes |
|---|---|---|
| `checkinWindow`, `escalation`, `escalationDelayMin`, `doseEscalation`, `quietHours`, `channels`, `criticalBypass`, `sessionLockMin`, `elderLockMin`, `toured`, `setupCallRequested` | Operational | Escalation lists member IDs |
| `textSize`, `highContrast`, `readAloud` | PII-adjacent | Can imply vision/hearing needs — treat as sensitive |
| `sharingPaused` | Operational | Elder privacy control (CC-81) |
| `consent` (version, at, by, onBehalfReason) | Operational / legal record | Keep as long as data is processed + retention period |
| `emergencyCard` (allergies, conditions, directives, bloodType, approvedByElder, approvedAt) | PHI | Shown to responders; always shared even when paused |

## Pilot data — separate, non-PHI store (`src/lib/pilot.ts`)

| Element | Fields kept | Class | Source | Who can see | Retention |
|---|---|---|---|---|---|
| Pilot lead | `at`, `role`, `state` (trimmed to 30 chars), `hasPro` | De-identified | `/pilot` form | Pilot team; aggregates on `/app/pilot` | Until pilot recruiting ends, then delete |
| Lead name and contact | **Not stored** by the prototype (form collects them but `addPilotLead` drops them) | PII | `/pilot` form | — | Production: must be stored to contact people → separate CRM-type store, delete after pilot |
| NPS response | `at`, `persona`, `score`, `comment` (health words scrubbed by `scrubHealth`, max 500 chars) | De-identified (best effort) | In-app feedback (CC-76) | Pilot team; dashboard hides groups under 5 (`MIN_COHORT`) | 12 months after pilot end (CC-74) |

Notes: `scrubHealth` is a keyword filter, not a guarantee; comments must still be reviewed before quoting. The pilot dashboard defaults to **synthetic** data in the prototype.

## Human actions

- [ ] Security officer and counsel confirm classifications, retention periods and the audit log exception.
- [ ] Decide whether `relation` and accessibility settings are treated as PHI.
- [ ] Define production store for pilot contact details.
- [ ] Re-run this inventory whenever `types.ts` changes.

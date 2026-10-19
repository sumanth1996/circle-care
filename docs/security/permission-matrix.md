# Permission Matrix

Notion story: CC-18 Define role permissions (matrix)
Status: Implemented in the prototype (`src/data/policy.ts`, enforced through `can()` — CC-19) and covered by `src/__tests__/policy.test.ts`. Production server-side enforcement is **not built** (no backend exists yet).

This page is a readable rendering of the `MATRIX` constant as of 2026-10-19. If the code changes, the code wins — regenerate this table.

## Roles

| Role | Who (demo) | How the role is decided |
|---|---|---|
| **Elder** | Margaret "Maggie" Lee | `Member.role = "elder"` |
| **Guardian** | Sarah Lee, daughter, healthcare POA | `role = "guardian"`; legal documents verified by review team (CC-23/24) |
| **Family** | James Lee, grandson | `role = "family"` |
| **Pro — on shift** | Ana Rivera (home care aide), Ruth Okafor (respite, pending, access expires in 14 days) | `role = "pro"` **and** a visit today with `checkIn` set and no `checkOut` (`onShift()`) |
| **Pro — off shift** | same people when not checked in | `role = "pro"` only |
| **Reviewer** | Internal Trust & Safety review team | actor id `trust-safety` → `"reviewer"` |

Anyone not in the circle, or whose `status` is not `active` (pending or revoked), gets **nothing** (`roleOf()` returns null).

## Matrix

Legend: R read · W write · P propose (needs approval) · A approve · I invite · X revoke · E export · D delete · V review · S respond · — no access

| Resource | What it is | Elder | Guardian | Family | Pro on shift | Pro off shift | Reviewer |
|---|---|---|---|---|---|---|---|
| `meds` | Medication list | R W | R W | R P | R P | — | — |
| `doses` | Dose confirmations | R W | R W | R W | R W | — | — |
| `tasks` | Care tasks | R W | R W | R W P | R W P | — | — |
| `notes` | Care notes (everyone) | R W | R W | R W | R W | — | — |
| `notes.private` | Guardian-only notes | — | R W | W | W | — | — |
| `docs` | Care documents | R | R W | R W | R W | — | — |
| `docs.legal` | POA / guardianship papers | R | R W | — | — | — | V |
| `approvals` | Change requests | R | R A | P | P | P | — |
| `circle` | Members and roles | R I X | R I X | R | R | R | — |
| `schedule` | Shifts | R | R W | R P | R P | R P | — |
| `history` | Activity feed / check-ins | R | R | R | — | — | — |
| `digest` | Weekly digest | R | R | — | — | — | — |
| `audit` | Access log | R | R | — | — | — | — |
| `settings` | Circle settings | R | R W | — | — | — | — |
| `emergencyCard` | Allergies, conditions, contacts | R W | R P | R | R | R | — |
| `sos` | SOS events | R W | R S | R S | R S | R S | — |
| `data` | Export / close circle | E D | E D | — | — | — | — |

## Rules explained

### `pro@shift` — minimum necessary for paid caregivers

The matrix uses a special rule, `pro@shift`, for anything about the elder's health or daily care. A professional caregiver matches it only while checked in to a visit today (`onShift()`): `visit.caregiverId === actor && visit.date === today && checkIn && !checkOut`. When the shift ends, access to medicines, doses, tasks, notes and documents ends with it. Off shift, a caregiver still sees what they need to do their job safely: the circle (who to call), their schedule, the emergency card, SOS — and they can propose schedule changes and swaps.

### Sharing paused — `ALWAYS_SHARED`

When the elder turns on **Pause sharing** in the Privacy Center (`settings.sharingPaused`, CC-81), `can()` refuses every action by **family** and **pro** roles except on three resources:

```ts
const ALWAYS_SHARED: Resource[] = ["sos", "emergencyCard", "circle"];
```

So emergencies still work (SOS and the emergency card) and people still know who is in the circle. The **guardian keeps access** while sharing is paused because they hold legal authority; the public FAQ says the guardian "is told sharing is paused." The elder's own access is never affected.

### Refused actions are logged

Most change actions in the store go through `guard()` in `src/data/store.tsx` (recordDose, verifyDose, saveMed, requestMedChange, decide, task actions, sosAcknowledge, saveShift, requestSwap, reviewDoc, invite, revoke, settings, exported — exceptions listed under Coverage gaps): if `can()` returns false, nothing changes and an `audit` entry with action `"denied"` is written. Three denials by one person within 10 minutes raise a security notice to the guardian (CC-35). Read access in the UI is checked with `AccessGuard` / `useCan`, which call the same `can()`.

### Notable design choices to review

1. **The elder cannot read guardian-only notes** (`notes.private` read = guardian only). This conflicts with "the elder owns her data" and may conflict with a right of access where HIPAA applies (CC-8 Q13). Product decision needed.
2. **The elder can read but not write circle settings** (`settings` write = guardian). The store makes an explicit exception: the elder may change her own fields in `ELDER_SETTINGS` (`textSize`, `highContrast`, `readAloud`, `sharingPaused`, `elderLockMin`, `emergencyCard`, `toured`) without the matrix check. Confirm whether she should also control things like her check-in window and quiet hours.
3. **Family can write doses**, i.e., confirm a dose remotely. Consider requiring presence or limiting to "taken with me".
4. **Approvals are proposable by an off-shift pro** (`"pro"` listed explicitly), unlike meds/tasks.

## Coverage gaps (prototype)

Closed on 2026-10-19. Every data-changing store action is now checked:

| Action | Check |
|---|---|
| `addNote`, `addDoc` | `notes` / `notes.private` write by visibility; `docs` / `docs.legal` write |
| `submitHandoff`, `acknowledgeHandoff` | new `handoffs` resource — write: pro@shift; read/ack: guardian, family, pro |
| `closeCircle` | `data` delete |
| `visitCheckIn` | professional caregivers only |
| `elderCheckin`, `elderAsk`, `elderSuggest` | the elder only |
| `sosResolve` | the elder (`sos` write) or a responder (`sos` respond) |
| `acceptShift` | the caregiver the shift was offered to |
| `acceptConsent` | the elder; or a verified guardian with a written reason |

`sosStart` stays open so the presenter can trigger SOS in the demo; in production only the elder's device can raise it. All of these must still be enforced server-side.

## How it's tested

`src/__tests__/policy.test.ts` generates one test per cell: for every resource × action, it checks elder, guardian and family against the matrix, and checks the professional caregiver both on shift and off shift. It also checks:

- unknown and revoked people get nothing;
- pausing sharing limits family and caregivers to emergencies while the guardian keeps access;
- only the review team can review legal documents.

Run `npm test`. On 2026-10-19 the full suite reported **180 tests passed** across 4 files.

## Production enforcement (not built)

- The same `MATRIX` and `can()` must run **in the API** on every request (CC-19); the client copy is for UX only and can be bypassed.
- On-shift status must come from server-recorded check-ins, not the device clock.
- Reviewer access must be a separate internal app with its own authentication, MFA and audit.
- Field-level filtering in responses (e.g., strip `notes.private` for non-guardians) rather than hiding in the UI.

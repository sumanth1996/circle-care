# Permission Matrix

Notion story: CC-18 Define role permissions (matrix)
Status: Implemented in the prototype (`src/data/policy.ts`, enforced through `can()` — CC-19) and covered by `src/__tests__/policy.test.ts`. Production server-side enforcement is **not built**: the accounts server exists, but care-circle data has no API yet (CC-202).

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
| `supply` | Pills on hand, refill requests (CC-120/121) | R W | R W | R W | R W | — | — |
| `wellbeing` | Daily check-ins: feeling, water, meals (CC-142/143) | R W | R ¹ | — | — | — | — |
| `chat` | Private family chat (CC-164/165) | R W I | R W I | R W | R W ² | R W ² | — |
| `help` | Help board requests (CC-209/210, CC-211) | R P ⁴ | R W S | R S ³ | R S ³ | R S ³ | — |
| `plan` | Coming Home plan (CC-213/214) | R | R W | — ⁵ | — ⁵ | — ⁵ | — |
| `questions` | Shared question list for a visit (CC-217) | R W ⁶ | R W ⁶ | R W | R W | — | — |
| `visitNotes` | After-visit notes and next steps (CC-218) | R W ⁷ | R W ⁷ | R W ⁷ | R W ⁷ | R W ⁷ | — |
| `calls` | Call log: organization, date, next step (CC-226 to CC-228) | R W | R W | R | R | — | — |
| `calls.admin` | Call outcome and person spoken to | R | R | R ⁸ | R ⁸ | — | — |
| `calls.ref` | Reveal a call's reference number in full | R | R | — | — | — | — |
| `aboutMe` | What matters to me sections (CC-219) | R W ⁹ | R W ⁹ | R ⁹ | R ⁹ | — | — |
| `away` | Sarah's away dates and who covers (CC-229 to CC-231) | R | R W | R ¹⁰ | — | — | — |
| `quietDays` | Maggie's resting and away days (CC-129) | R W ¹¹ | R | R | — | — | — |
| `memoryAids` | Notes on Maggie's home (CC-138, CC-139) | R ¹² | R W ¹² | R W ¹² | R | — | — |
| `scams` | "Is this a scam?" reports (CC-132, CC-133) | R W | R S ¹³ | — | — | — | — |
| `tips` | Weekly scam-awareness tips (CC-134) | R W | — | — | — | — | — |

¹ Only while Maggie shares check-ins (`settings.dailyLog.shareWithGuardian`) and hasn't paused all sharing.
³ Only the requests Sarah shared with that person (`HelpRequest.audience`, checked by `canSeeHelp()` in `src/data/help.ts`). Respond means claim ("I'll do it"), give it back ("Can't anymore") and mark it done; only the person who claimed a request can give it back or finish it. A request tied to an appointment shows as an appointment only, and as just "Appointment" and the time to anyone without appointment access. Hidden from family and caregivers while sharing is paused.
⁴ Propose here means Maggie asks for a hand herself (`askHelp`). It goes to the people she chose in her Privacy Center (`settings.helpFrom`, which only she can change, through `setHelpFrom`), and Sarah is told.
⁵ Others never see the plan. An item Sarah gives someone becomes a help request on their board, so they see that item only, under `help`.
⁶ Also needs appointment access (`canSeeQuestions()` in `src/data/visitQuestions.ts`). Only Maggie can hide an item (then only she and Sarah see it); only Sarah sets the order; the person who added an item, or Sarah, can remove it.

⁷ Reading also needs appointment access, so Maggie's paused sharing hides the notes from family and caregivers (`canReadNotes()` in `src/data/visitNotes.ts`). Writing is limited to Maggie, Sarah and the person recorded as taking Maggie to that visit; anyone else is refused and audited. Each next step becomes a one-off care task for its owner.
⁸ Only the family members and caregivers Maggie picks for "Insurance and admin details" in her Privacy Center (`settings.adminTo`, which only she changes, through `setAdminTo`). Everyone else sees a call's organization, date and next step only, and reference numbers show masked to their last 4.
⁹ Each section only for the people Maggie picks (`AboutSection.sharedWith`, checked by `canSeeSection()` in `src/data/aboutMe.ts`); a new one is shared with no one but its writer until she picks. Only Maggie changes who sees a section. Sarah writes only while Maggie lets her (`aboutMe.sarahCanEdit`), and only sections shared with her or not yet written.
¹⁰ Only family can be asked to cover, never a paid caregiver. While the person covering has said yes and the dates have started, the alerts Sarah would get that their own role can already read go to them, they take Sarah's place in the SOS order and can finish Sarah's one-off next steps due before the end date (`routeForCover()`, `escalationOrder()` in `src/data/away.ts`). Away mode adds no read rights: settings, approvals and the Privacy Center stay with Sarah and Maggie. Only Sarah sets or ends it, only the person asked answers, and only Maggie asks for someone else; every refusal is audited.
¹¹ No reason is asked or kept. A resting or away day pauses the missed check-in prompt, Sarah's missed check-in alert, the 7 PM nothing-logged reminder and the no-meals note; medicine, SOS and late-caregiver alerts never pause (`quietFor()` in `src/data/selectors.ts`). Only Maggie sets or ends one, and every refusal is audited.
¹² Only the writer or Sarah changes or removes a note, and only Maggie turns one off (`setAidOn()` in `src/data/memoryAids.ts`). A note that looks like a PIN, door code or password is refused (`looksLikeCode()`). Hidden from family and caregivers while sharing is paused.
¹³ Respond means tick the shared checklist and mark the report resolved, with or without a note for Maggie (`checkScam()`, `resolveScam()` in `src/data/scams.ts`). The note and photo Maggie adds never reach family or caregivers and are never written to the access log; the photo is deleted 30 days after the report is resolved. Circle Care never contacts a bank or agency itself.
² Only once Maggie or Sarah adds that caregiver (`state.chat.pros`); switching them off, removing them from the circle or their time limit ending takes them out at once. Pausing sharing also takes family and caregivers out of the chat, like every other non-emergency resource.

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

Sprint 12 actions live in `src/data/everydayActions.ts` and use `allowed()` from the store, which does the same check and writes the same `denied` entry.

Most change actions in the store go through `guard()` in `src/data/store.tsx` (recordDose, verifyDose, saveMed, requestMedChange, decide, task actions, sosAcknowledge, saveShift, requestSwap, reviewDoc, invite, revoke, settings, exported — exceptions listed under Coverage gaps): if `can()` returns false, nothing changes and an `audit` entry with action `"denied"` is written. Three denials by one person within 10 minutes raise a security notice to the guardian (CC-35). Read access in the UI is checked with `AccessGuard` / `useCan`, which call the same `can()`.

### Notable design choices to review

1. **The elder cannot read guardian-only notes** (`notes.private` read = guardian only). This conflicts with "the elder owns her data" and may conflict with a right of access where HIPAA applies (CC-8 Q13). Product decision needed.
2. **The elder can read but not write circle settings** (`settings` write = guardian). The store makes an explicit exception: the elder may change her own fields in `ELDER_SETTINGS` (`textSize`, `highContrast`, `readAloud`, `sharingPaused`, `elderLockMin`, `emergencyCard`, `toured`) without the matrix check. Confirm whether she should also control things like her check-in window and quiet hours.
3. **Family can write doses**, i.e., confirm a dose remotely. Consider requiring presence or limiting to "taken with me".
4. **Approvals are proposable by an off-shift pro** (`"pro"` listed explicitly), unlike meds/tasks.

## Coverage gaps (prototype)

Closed on 2026-10-19 for the actions below. The CC-10 threat model (2026-11-15) found three that are still open: `acceptInvite` has no check, `invite` accepts any role from the caller, and the review queue at `/app/review` has no route guard. The demo controls (`skipAhead`, `simulate`, `resetDemo`, persona switching) are unguarded on purpose. All of these move to the server in CC-202.

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

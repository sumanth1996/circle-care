# POC Research Round (Dummy Profiles)

Notion stories: CC-2 elders · CC-3 caregivers · CC-4 guardians · CC-5 synthesis and journey maps (Sprint 24, POC)
Status: POC ROUND, DUMMY PROFILES, 2026-11-16. This is a portfolio proof of concept, not real research. No real person was interviewed and no one was contacted. Every participant, answer, quote and score below is made up to show how the research would run and feed the roadmap. Nothing here is evidence; the verdicts are marked (dummy) and real interviews would replace them.

## What this round shows

Circle Care is a portfolio product. This round runs the whole research loop end to end, with 20 dummy participants standing in for real ones: recruit to quota, interview with the [guides](02-interview-guide-elders.md), score every hypothesis against its own threshold, find themes, check the [journey maps](05-journey-maps.md), and turn what was learned into roadmap changes. The method, the guides and the tables are real and reusable; the people and their answers are not.

It builds on the [practice round](12-practice-round.md), which dry-ran the guides with 18 synthetic profiles and found gaps in them. Those gaps were fixed first (guides v3), and this round reuses those profiles as dummy participants, plus two new ones.

## Top learnings and how they shaped the roadmap

Dummy results, shown as they would be presented to a product team.

| # | What we learned (dummy) | Evidence (dummy) | Roadmap change |
|---|---|---|---|
| 1 | People read **Request refill** as the app contacting the pharmacy. | H-C8 and H-G9 not supported: 8 of 12 caregivers and guardians got it wrong. | New story: reword the button and its confirmation so it says the person asked the pharmacy themselves. Highest priority, because a wrong reading can leave someone without medicine. |
| 2 | Caregivers want to see the plan before the shift, not only on it. | H-C5 not supported: 4 of 6 professional caregivers. | New story: a read-only preview of the next shift the evening before, which the guardian can turn off. |
| 3 | Older elders need one walkthrough and bigger text before the app feels easy. | H-E6 and H-E7 mixed: 4 of 6 succeeded unaided on T1 and T5. | New story: larger default text, a one-time walkthrough of the three buttons, and a visible *Saved* on *My day*. |
| 4 | Family helpers do hands-on care nobody taught them, alongside the aide. | H-C12 supported (2 of 2); H-C13 mixed. | New discovery story: a family-helper role with one shared "who did it" list. Not in the MVP. |
| 5 | Long-distance guardians want to hear about a missed dose at once. | H-G3 supported overall (4 of 6), but both long-distance guardians disagreed. | New story: an option to be told at the same time as the caregiver. Caregiver-first stays the default. |
| 6 | The core guardian loop works. | H-G7, H-G8, H-G6 and H-G10 supported. | Today at a glance, the evening recap, the weekly digest and the elder's sharing choice stay in the MVP unchanged. |

**MVP scope:** it holds. Three of the changes are wording and small features inside existing screens; the family-helper role is the one new area, and it goes to discovery, not the MVP. Every new story is marked as coming from dummy data and needs real research before it is built.

## Participants (dummy)

IDs start with DP (dummy profile), apart from the real IDs (E1, C1, G1, F1) in the [recruiting tracker](09-recruiting-tracker.csv) and the practice IDs (PR-…). The mix follows the screener §2 quotas: 6 elders, 6 professional caregivers (4 agency, 2 private-pay), 2 family helpers and 6 guardians (2 long-distance, 1 court-appointed, 3 who work).

| ID | Kind | Segment | Dummy profile | Built from |
|---|---|---|---|---|
| DP-E1 | DUMMY | Elders | 82, lives alone, flip phone for calls only (from PR-E1) | PR-E1, S6 |
| DP-E2 | DUMMY | Elders | 76, lives with spouse, smartphone for calls and texts only (from PR-E2) | PR-E2, S5, S7 |
| DP-E3 | DUMMY | Elders | 88, lives alone, low vision (from PR-E3) | PR-E3, S6 |
| DP-E4 | DUMMY | Elders | 72, lives with an adult son, uses a tablet (from PR-E4) | PR-E4, S5, S7 |
| DP-E5 | DUMMY | Elders | 79, lives alone, hard of hearing (from PR-E5) | PR-E5, S5 |
| DP-E6 | DUMMY | Elders | 85, lives with a live-in aide (from PR-E6) | PR-E6, S2 |
| DP-C1 | DUMMY | Caregivers | Agency aide, 4 clients a week, English second language (from PR-C1) | PR-C1, S4 |
| DP-C2 | DUMMY | Caregivers | Agency aide, mostly overnight shifts (from PR-C2) | PR-C2, S4 |
| DP-C3 | DUMMY | Caregivers | Agency aide, English second language (from PR-C3) | PR-C3, S4 |
| DP-C4 | DUMMY | Caregivers | Private-pay aide, one long-term client (from PR-C4) | PR-C4 |
| DP-C5 | DUMMY | Caregivers | Private-pay aide, two clients (from PR-C5) | PR-C5, S4 |
| DP-C6 | DUMMY | Caregivers | Agency aide, two agencies, 2 years in (new dummy profile) | S4, journey 2 |
| DP-F1 | DUMMY | Family helpers | Son, works full time, covers weekends (from PR-C6) | PR-C6, S1, S7 |
| DP-F2 | DUMMY | Family helpers | Grandchild, a student who lives with the elder and helps with transfers and evening medicines (new dummy profile) | S1, journey 1 |
| DP-G1 | DUMMY | Guardians | Healthcare POA, daughter, lives 3 hours away, works full time (from PR-G1) | PR-G1, S1, S2, S3 |
| DP-G2 | DUMMY | Guardians | Court-appointed professional guardian, 12 clients (from PR-G2) | PR-G2 |
| DP-G3 | DUMMY | Guardians | POA, son, lives 20 minutes away (from PR-G3) | PR-G3, S1 |
| DP-G4 | DUMMY | Guardians | POA, niece, lives in another state (from PR-G4) | PR-G4, S2 |
| DP-G5 | DUMMY | Guardians | POA, spouse of the elder's son, retired (from PR-G5) | PR-G5 |
| DP-G6 | DUMMY | Guardians | POA, daughter, works shifts (from PR-G6) | PR-G6, S2 |

Sources S1 to S7 are listed in the [practice round](12-practice-round.md#sources).

## Method

- **Sessions:** each dummy session follows its guide (v3) and note template. Family helpers used the [family-helper part](03-interview-guide-caregivers.md#family-helpers-in-place-of-2-to-4) of the caregiver guide.
- **Concept tests:** scripted walkthroughs on the demo, scored 1 to 5 as the guides ask. The scores are invented to match each profile; they are not measurements. Optional tasks ran when the dummy session had time: elder T8 with 4 elders, guardian T5 with 4 guardians and T9 with 5. The rolling check lists the scores for the tasks that bear on a hypothesis.
- **Synthesis:** the [synthesis kit](11-synthesis-kit.md) tables, filled in order: rolling check, saturation, scorecard, themes, journey-map checks.
- **Scoring:** each hypothesis is judged by its own *Validated if* column in its guide. Caregiver hypotheses H-C1 to H-C11 count the 6 professional caregivers; H-C12 and H-C13 count the 2 family helpers.

## Rolling check (dummy sessions)

One row per session, in the synthesis kit §2 format.

| ID | Date | Top 3 observations (dummy words) | New theme? | Hypotheses touched (supported / against) | Task scores (dummy) |
|---|---|---|---|---|---|
| DP-E1 | 2026-11-16 | "I'd rather the phone reminded me than my daughter." · Never wears the pendant in the shower; would hold a button on the phone if it were nearby. · Couldn't find the big buttons until shown once; text too small. | Y | H-E1, H-E4, H-E5 / H-E2, H-E3, H-E6, H-E7, H-E8, H-E9 | T1 2/5, T5 2/5, T6 3/5, T7 2/5 |
| DP-E2 | 2026-11-16 | Spouse fills the pill box; a phone reminder "doesn't nag like he does". · Fine with the aide seeing medicines, not notes about mood. · Read the text easily once it was bigger; asked for that first. | Y | H-E1, H-E2, H-E4, H-E6, H-E7, H-E8, H-E9, H-E10 / none | T1 4/5, T5 4/5, T6 4/5, T7 4/5, T8 4/5 |
| DP-E3 | 2026-11-16 | Large print matters more than the number of buttons. · Looked for a Submit button on *My day* and thought nothing had saved. · Wants the daughter told about any missed dose. | N | H-E1, H-E2, H-E5 / H-E3, H-E4, H-E6, H-E7, H-E8, H-E9 | T1 2/5, T5 1/5, T6 3/5, T7 2/5 |
| DP-E4 | 2026-11-16 | Skips a tablet on purpose some days and doesn't want that "reported". · Would pause sharing during a hospital stay. · Doesn't want the evening recap on a bad day. | Y | H-E2, H-E3, H-E4, H-E6, H-E7, H-E8, H-E9 / H-E1, H-E10 | T1 5/5, T5 5/5, T6 5/5, T7 5/5, T8 2/5 |
| DP-E5 | 2026-11-16 | Phone calls are hard, so short messages appeal. · Wants to choose who sees how she feels, day by day. · The phone is often in another room, so a phone SOS doesn't fully replace a pendant. | N | H-E1, H-E2, H-E4, H-E5, H-E6, H-E7, H-E8, H-E9, H-E10 / none | T1 4/5, T5 4/5, T6 5/5, T7 4/5, T8 4/5 |
| DP-E6 | 2026-11-16 | The guardian chose the aide without asking; "looked after" means asked first. · Would pause sharing the week the aide is away and family visits. · Prefers to call rather than message. | N | H-E2, H-E3, H-E4, H-E6, H-E7, H-E8, H-E10 / H-E1, H-E5, H-E9 | T1 4/5, T5 4/5, T6 4/5, T7 3/5, T8 4/5 |
| DP-C1 | 2026-11-16 | Clocks in on the agency app, then texts the family "here": two check-ins for one arrival. · About 25 minutes a shift on notes and texts, much of it at home, unpaid. · Thought **Request refill** had told the pharmacy. | Y | H-C1, H-C2, H-C3, H-C4, H-C6, H-C7, H-C9, H-C10, H-C11 / H-C5, H-C8 | T1 4/5, T2 4/5, T3 4/5, T5 4/5, T6 4/5 |
| DP-C2 | 2026-11-16 | Learns of medicine changes from a family text, not the agency. · Wants to read the plan the evening before a shift. · Would rather the daughter hears about a missed dose at once, "so she doesn't think I hid it". | Y | H-C1, H-C2, H-C4, H-C6, H-C7, H-C8 / H-C3, H-C5, H-C9, H-C10, H-C11 | T1 4/5, T2 5/5, T3 4/5, T5 4/5, T6 3/5 |
| DP-C3 | 2026-11-16 | Door check-in is fine "if it proves I was there" in a dispute. · Doesn't want off-shift texts from family; the recap would cut them. · Expected the refill button to call the pharmacy. | N | H-C1, H-C2, H-C3, H-C4, H-C5, H-C6, H-C9, H-C10, H-C11 / H-C7, H-C8 | T1 5/5, T2 4/5, T3 4/5, T5 3/5, T6 4/5 |
| DP-C4 | 2026-11-16 | Calls the pharmacy herself and read **Request refill** as the app doing it. · Learned to give the injection from the family, not a nurse. · Wants the plan the night before; private-pay has nothing like EVV. | Y | H-C3, H-C7 / H-C1, H-C2, H-C4, H-C5, H-C8, H-C9, H-C11 | T1 4/5, T2 4/5, T3 2/5, T5 4/5, T6 4/5 |
| DP-C5 | 2026-11-16 | Already in the family group chat and feels watched there. · The health-detail check felt like being policed. · Thought **Request refill** had contacted the pharmacy. | N | H-C1, H-C2, H-C4, H-C7, H-C9, H-C11 / H-C3, H-C5, H-C8, H-C10 | T1 4/5, T2 4/5, T3 4/5, T5 4/5, T6 2/5 |
| DP-C6 | 2026-11-16 | Two agency apps and a paper notebook for one client. · Would send the drafted hand-off after a quick edit. · Fine seeing the plan only on shift; explained the refill button correctly. | N | H-C1, H-C2, H-C3, H-C4, H-C5, H-C6, H-C7, H-C8, H-C9, H-C10, H-C11 / none | T1 5/5, T2 5/5, T3 5/5, T5 5/5, T6 4/5 |
| DP-F1 | 2026-11-16 | Was never shown how to give the injectable medicine; learned from a video. · Gave a dose the aide had already given, once. · Coordinates with the aide by text and wants one shared list. | Y | H-C12, H-C13 / none | T2 3/5, T5 4/5, T6 4/5 |
| DP-F2 | 2026-11-16 | Learned to help with transfers by watching the aide; nobody showed them properly. · A notebook on the fridge says who did what, so nothing doubles up. · Would use the app if the aide used it too. | N | H-C12 / H-C13 | T2 4/5, T5 4/5, T6 5/5 |
| DP-G1 | 2026-11-16 | Calls four times a day; heard about a missed dose two days late. · Wants to be told at the same time as the aide, then let the aide fix it. · Read **Request refill** as the app calling the pharmacy. | Y | H-G1, H-G2, H-G4, H-G5, H-G6, H-G7, H-G8, H-G10, H-G11 / H-G3, H-G9 | T1 5/5, T2 4/5, T5 4/5, T6 5/5, T7 3/5, T9 4/5 |
| DP-G2 | 2026-11-16 | Calls each client about once a day; finds out about missed visits days later. · A 1–2 day document review is normal for her. · Some decisions the elder needn't see; the chat check slowed her down. | Y | H-G2, H-G3, H-G4, H-G7, H-G8, H-G9 / H-G1, H-G5, H-G6, H-G10, H-G11 | T1 5/5, T2 5/5, T6 4/5, T7 4/5, T9 2/5 |
| DP-G3 | 2026-11-16 | Repeats the same update to three siblings each week; the digest would end the calls. · Lives close, so hears about problems the same day. · Would hide some money decisions from Mom. | N | H-G3, H-G4, H-G6, H-G7, H-G8, H-G10, H-G11 / H-G1, H-G2, H-G5, H-G9 | T1 5/5, T2 4/5, T5 5/5, T6 4/5, T7 3/5, T9 4/5 |
| DP-G4 | 2026-11-16 | Feels guilty and anxious between calls; the glance answered "is she OK?" fast. · Wants a missed dose at once, not after the aide's 30 minutes. · Wants proof of authority accepted the same day. | N | H-G1, H-G2, H-G5, H-G6, H-G7, H-G8, H-G10, H-G11 / H-G3, H-G4, H-G9 | T1 5/5, T2 4/5, T5 4/5, T6 5/5, T7 2/5, T9 4/5 |
| DP-G5 | 2026-11-16 | Requests refills by phone herself and read the button the same way. · Found the evening recap but opened the medicines screen to be sure. · Wants to see check-ins whatever Mom chooses. | N | H-G1, H-G2, H-G3, H-G4, H-G7 / H-G5, H-G6, H-G8, H-G9, H-G10 | T1 4/5, T2 4/5, T6 3/5, T7 2/5 |
| DP-G6 | 2026-11-16 | Accepts that Mom decides what she shares, "but not if she stops eating"; the meal note covers that. · The health-detail check was welcome. · Explained the refill button correctly. | N | H-G1, H-G2, H-G3, H-G4, H-G5, H-G6, H-G7, H-G8, H-G9, H-G10, H-G11 / none | T1 5/5, T2 5/5, T5 4/5, T6 5/5, T7 4/5, T9 5/5 |

**Saturation.**

| Segment | Sessions done | Minimum | Last two added a new theme? | Stop recruiting? |
|---|---|---|---|---|
| Elders | 6 | 6 | No | Yes (dummy) |
| Caregivers | 6 | 6 | No | Yes (dummy) |
| Family helpers | 2 | 2 | Yes | At the stretch quota; the open theme is noted as a gap (dummy) |
| Guardians | 6 | 6 | No | Yes (dummy) |

## Hypothesis scorecard (dummy)

Every hypothesis in the three guides, judged by its own threshold. Counts come from the rolling check above.

| Hypothesis | Validated if (from the guide) | Supported by | Against | Verdict | What it changes |
|---|---|---|---|---|---|
| H-E1 | 4+ of 6 | DP-E1, DP-E2, DP-E3, DP-E5 | DP-E4, DP-E6 | supported (dummy) | Keep device reminders as the default; family reminders stay optional. |
| H-E2 | 4+ of 6 | DP-E2, DP-E3, DP-E4, DP-E5, DP-E6 | DP-E1 | supported (dummy) | Keeps the Privacy Center split between aide and family. |
| H-E3 | 3+ of 6 | DP-E4, DP-E6 | DP-E1, DP-E3 | mixed (dummy) | Two found "pause" confusing. Keep the control, test plainer wording; don't extend it. |
| H-E4 | 4+ of 6 | DP-E1, DP-E2, DP-E4, DP-E5, DP-E6 | DP-E3 | supported (dummy) | Keep skip and refuse as recorded choices with no nagging. |
| H-E5 | 3+ of 6 | DP-E1, DP-E3, DP-E5 | DP-E6 | supported (dummy) | Phone SOS stays; one elder keeps the phone in another room, so it doesn't replace a wearable. |
| H-E6 | 5+ of 6 | DP-E2, DP-E4, DP-E5, DP-E6 | DP-E1, DP-E3 | mixed (dummy) | New story: larger default text and a one-time walkthrough of the three buttons. |
| H-E7 | 5+ of 6 | DP-E2, DP-E4, DP-E5, DP-E6 | DP-E1, DP-E3 | mixed (dummy) | Same story: a visible *Saved* after each tap on *My day*. |
| H-E8 | Half or more of T6 | DP-E2, DP-E4, DP-E5, DP-E6 | DP-E1, DP-E3 | supported (dummy) | Keep the day-by-day sharing switch. |
| H-E9 | Half or more of T7 | DP-E2, DP-E4, DP-E5 | DP-E1, DP-E3, DP-E6 | supported (dummy) | Keep the chat; calls stay the main channel for some. |
| H-E10 | Two-thirds of T8 | DP-E2, DP-E5, DP-E6 | DP-E4 | supported (dummy) | Keep the recap; consider letting the elder skip a day. |
| H-C1 | Median 15+ min across 6+ | DP-C1, DP-C2, DP-C3, DP-C5, DP-C6 | DP-C4 | supported (dummy) | Documentation time is the caregiver pitch; measure it in the pilot. |
| H-C2 | 4+ of 6 | DP-C1, DP-C2, DP-C3, DP-C5, DP-C6 | DP-C4 | supported (dummy) | Integration with agency apps moves up the later roadmap. |
| H-C3 | 4+ of 6 | DP-C1, DP-C3, DP-C4, DP-C6 | DP-C2, DP-C5 | supported (dummy) | Keep door check-in, framed as protection. |
| H-C4 | 4+ of 6 | DP-C1, DP-C2, DP-C3, DP-C5, DP-C6 | DP-C4 | supported (dummy) | Keep the drafted hand-off. |
| H-C5 | 4+ of 6 | DP-C3, DP-C6 | DP-C1, DP-C2, DP-C4, DP-C5 | not supported (dummy) | New story: a read-only preview of the next shift, the evening before, that the guardian can turn off. |
| H-C6 | Agency caregivers describe mandatory EVV | DP-C1, DP-C2, DP-C3, DP-C6 | none | supported (dummy) | Circle Care sits beside EVV, never replaces it. |
| H-C7 | 4+ of 6 | DP-C1, DP-C2, DP-C4, DP-C5, DP-C6 | DP-C3 | supported (dummy) | Keep *Pills on hand*. |
| H-C8 | 4+ of 6 | DP-C2, DP-C6 | DP-C1, DP-C3, DP-C4, DP-C5 | not supported (dummy) | New story: change the refill wording (see the top learning). |
| H-C9 | 4+ of 6 | DP-C1, DP-C3, DP-C5, DP-C6 | DP-C2, DP-C4 | supported (dummy) | Keep family-added chat membership. |
| H-C10 | 4+ of 6 | DP-C1, DP-C3, DP-C6 | DP-C2, DP-C5 | mixed (dummy) | Keep the check; soften its wording for caregivers. |
| H-C11 | Half or more of T7 | DP-C1, DP-C3, DP-C5, DP-C6 | DP-C2, DP-C4 | supported (dummy) | Keep the evening recap in the MVP. |
| H-C12 | Both family helpers | DP-F1, DP-F2 | none | supported (dummy) | New discovery story: a family-helper role. |
| H-C13 | Both family helpers | DP-F1 | DP-F2 | mixed (dummy) | Same story: one shared "who did it" list for family helper and aide. |
| H-G1 | Median 3+ across 6+ | DP-G1, DP-G4, DP-G5, DP-G6 | DP-G2, DP-G3 | supported (dummy) | Today at a glance stays the guardian's home screen. |
| H-G2 | 4+ of 6 | DP-G1, DP-G2, DP-G4, DP-G5, DP-G6 | DP-G3 | supported (dummy) | Keep escalation alerts in the MVP. |
| H-G3 | 4+ of 6 | DP-G2, DP-G3, DP-G5, DP-G6 | DP-G1, DP-G4 | supported (dummy) | Keep caregiver-first timers; new story for a "tell me at the same time" option. |
| H-G4 | 4+ of 6 | DP-G1, DP-G2, DP-G3, DP-G5, DP-G6 | DP-G4 | supported (dummy) | Keep the 1–2 day review with a visible expected time. |
| H-G5 | 4+ of 6 | DP-G1, DP-G4, DP-G6 | DP-G2, DP-G3, DP-G5 | mixed (dummy) | Keep every decision visible to the elder for now; revisit with real guardians. |
| H-G6 | 4+ of 6 | DP-G1, DP-G3, DP-G4, DP-G6 | DP-G2, DP-G5 | supported (dummy) | Keep the weekly digest. |
| H-G7 | T1 5+ of 6 | DP-G1, DP-G2, DP-G3, DP-G4, DP-G5, DP-G6 | none | supported (dummy) | No change. |
| H-G8 | T6 5+ of 6 | DP-G1, DP-G2, DP-G3, DP-G4, DP-G6 | DP-G5 | supported (dummy) | No change. |
| H-G9 | 4+ of 6 | DP-G2, DP-G6 | DP-G1, DP-G3, DP-G4, DP-G5 | not supported (dummy) | Same refill wording story as H-C8. |
| H-G10 | 4+ of 6 | DP-G1, DP-G3, DP-G4, DP-G6 | DP-G2, DP-G5 | supported (dummy) | Keep the elder's choice; the meal note covers the "stops eating" worry. |
| H-G11 | Most of T9 (4+ of 6 if all did) | DP-G1, DP-G3, DP-G4, DP-G6 | DP-G2 | supported (dummy) | Keep the check. |

Totals (dummy): 25 supported, 6 mixed, 3 not supported, out of 34.

## Synthesis (dummy)

### Themes

A theme needs 3 or more participants (journey maps, synthesis process step 4).

| Theme (dummy participant voice) | Segments | # participants | Participants | Hypotheses affected | Opportunity |
|---|---|---|---|---|---|
| "I thought the button told the pharmacy." | Caregivers, guardians | 8 | DP-C1, DP-C3, DP-C4, DP-C5, DP-G1, DP-G3, DP-G4, DP-G5 | H-C8, H-G9 | Reword **Request refill** and its confirmation |
| "Let me read the plan the night before." | Caregivers | 4 | DP-C1, DP-C2, DP-C4, DP-C5 | H-C5 | Next-shift preview, guardian can turn it off |
| "Show me once, in bigger letters." | Elders | 3 | DP-E1, DP-E2, DP-E3 | H-E6, H-E7 | Larger default text, one-time walkthrough, *Saved* feedback |
| "Nobody showed me how to do it." | Family helpers, caregivers | 3 | DP-F1, DP-F2, DP-C4 | H-C12, H-C13 | Family-helper role with a shared "who did it" list (discovery) |
| "Tell me at the same time, then let the aide fix it." | Guardians, caregivers | 3 | DP-G1, DP-G4, DP-C2 | H-G3 | Option to be told at the same time as the caregiver |
| "How I feel is mine to share." | Elders, guardians | 8 | DP-E2, DP-E4, DP-E5, DP-E6, DP-G1, DP-G3, DP-G4, DP-G6 | H-E8, H-G10 | None: confirms the sharing switch |
| "One update instead of three calls." | Guardians, caregivers | 8 | DP-G1, DP-G3, DP-G4, DP-G6, DP-C1, DP-C3, DP-C5, DP-C6 | H-G6, H-C11 | None: keeps the recap and the digest |

### Elders: top 5 pains and 3 jobs to be done (dummy)

Pains, most participants first:
1. Not knowing who reads what is written about them (5 of 6).
2. Being reminded or checked on by family in a way that feels like monitoring (4 of 6).
3. Small text and hidden buttons on phones (3 of 6).
4. Decisions about their care made without asking them (1 of 6, said strongly).
5. Doubt about whether a dose was taken (2 of 6).

Jobs to be done:
1. "Let my family know I'm fine without having to say it every day."
2. "Help me keep my medicines straight without someone standing over me."
3. "Let me decide, day by day, who sees what about me."

### Caregivers: tools, workarounds and top pains (dummy)

- **Tools:** agency apps with clock-in (4 of 6, one aide uses two), personal texts (6 of 6), a paper notebook in the home (3 of 6).
- **Workarounds:** texting the family on arrival as well as clocking in; writing notes at home after the shift; asking the family by text whether a medicine changed.
- **Top pains:** the same information entered in two or three places (5 of 6); 15 or more minutes a shift on notes and updates (5 of 6); not seeing the plan before the shift (4 of 6); medicine changes that arrive by text (3 of 6).
- **Family helpers:** both learned a hands-on task with no training; one gave a dose the aide had already given.

### Guardians: decisions and alerts, ranked (dummy)

Decisions, most weighty first: medicine changes, care-schedule changes, who joins the circle, spending on care. Alerts, most wanted first: SOS (6 of 6), a missed dose (6 of 6, two want it at once), a missed visit (5 of 6), low medicine supply (4 of 6), a change in eating (3 of 6).

## Journey-map checks (dummy)

CC-5 asks for the maps to be checked with at least 5 participants, at least one per segment (synthesis kit §4). Seven dummy checks ran. One stage was called wrong and was rewritten in the [journey maps](05-journey-maps.md) (v0.6).

| ID | Segment | Stages confirmed | Stages changed | Stages wrong | Missing moment |
|---|---|---|---|---|---|
| DP-E2 | Elders | Morning wake-up, Aide visit, Afternoon alone, Something goes wrong, Evening | Medicines (a spouse fills the pill box) | none | Coming home from a hospital stay |
| DP-E5 | Elders | Medicines, Aide visit, Afternoon alone, Something goes wrong, Evening | Morning wake-up (texts, not calls) | none | none |
| DP-C1 | Caregivers | Arrival, Doing the work, Medicines, Communicating, Leaving / hand-off | Before shift (wants the plan the evening before) | none | none |
| DP-C4 | Caregivers | Before shift, Doing the work, Medicines, Communicating, Leaving / hand-off | none | Arrival (private-pay aides have no EVV app) | none |
| DP-G1 | Guardians | Morning, Problem appears, Coordinating family, End of week | Decision (decides with Mom on a video call); At work (checks at lunch) | none | none |
| DP-G4 | Guardians | Morning, At work, Problem appears, Decision, Coordinating family, End of week | none | none | Flying in when something goes wrong |
| DP-F1 | Family helpers | Weekday, Weekend, Hands-on task, Hand-back (journey 4) | none | none | none |

## Definition of done, checked (POC)

Against the [synthesis kit](11-synthesis-kit.md) §5, for a POC with dummy profiles:

- **CC-2 elders:** 6 dummy sessions; top 5 pains and 3 jobs written from the scorecard. Done (POC).
- **CC-3 caregivers:** 6 professional (4 agency, 2 private-pay) and 2 family-helper dummy sessions; tools, workarounds and top pains written. Done (POC).
- **CC-4 guardians:** 6 dummy sessions; decisions and alerts ranked. Done (POC).
- **CC-5 synthesis:** 7 themes, the maps revised (v0.6) and 7 dummy checks, one per segment at least. Done (POC). The maps stay hypothesis journeys until real people check them.

For real research, the [practice round](12-practice-round.md#what-closes-cc-2-to-cc-5) still lists what each story would need.

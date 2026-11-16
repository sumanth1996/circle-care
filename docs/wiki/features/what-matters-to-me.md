# What matters to me

<div class="cc-meta" markdown>

| | |
|---|---|
| **Feature ID / area** | F-20 · Maggie's own words on how she likes things done |
| **Personas** | Maggie (writes and shares), Sarah (helps write while Maggie lets her), James and Ana (read the parts shared with them) |
| **Status** | <span class="cc-badge cc-badge--built">Built in prototype</span> |
| **Related stories** | CC-219 What matters to me |
| **Last updated** | 2026-11-16 (Sprint 19) |

</div>

## Overview

**What.** Four short sections in Maggie's words: **My day**, **Food I like**, **How to help me** and **Things I don't want**. She picks who sees each one. Ana sees the parts shared with her on her Today screen during her shift, with **How to help me** first.

**Why.** A new caregiver learns how Maggie likes to be treated from Maggie, not from a handoff note written about her.

**Business value.** It keeps Maggie at the center of her own care and makes every new caregiver useful faster.

## User journey

1. **What matters to me** on Maggie's home, **What matters to Maggie** in the menu for everyone else.
2. **Write** or **Change** a section, type or dictate with the keyboard microphone, then **Save**. A new section is seen by nobody else until Maggie picks.
3. Under each section, Maggie turns on who sees it (*Sarah sees My day*, *Ana sees Things I don't want*). The same choices are in her Privacy Center.
4. **Sarah can help write this** lets Sarah add or change the sections shared with her. Maggie is told when Sarah adds one, and sees **Changes since you last looked** with the before and after.
5. Ana, on shift, sees **What matters to Maggie** on Today. Off shift she sees nothing.

## Functional details & business rules

| Rule | Value |
|---|---|
| Sections | My day, Food I like, How to help me, Things I don't want; 1,500 characters each |
| Who sees a section | Maggie, and the people in its `sharedWith` list, which only Maggie changes |
| Who writes | Maggie; Sarah only while `sarahCanEdit` is on, and only sections shared with her or not written yet |
| A section Sarah adds | Shared with Sarah only until Maggie picks; Maggie is told |
| Clearing a section | Maggie only |
| Shift screen order | How to help me, My day, Food I like, Things I don't want |

## Permissions & privacy

`MATRIX.aboutMe` (read: elder, guardian, family, pro on shift; write: elder, guardian), narrowed per section in `src/data/aboutMe.ts`. Refused changes are audited as "change Maggie's What matters to me".

## Data captured

`AboutMe` (`sections, sarahCanEdit, elderSeenAt`) and `AboutSection` (`key, text, by, at, sharedWith, changedBy, changedAt, before`) in `state.aboutMe`. Listed in the [data inventory](../../compliance/09-data-inventory.md) and the regulatory memo §2.1. Every save and sharing change is in the access log.

## Test coverage

| Suite | Covers |
|---|---|
| Unit — `sprint19.test.ts` | Per-section sharing, Sarah's editing switch, new sections private until Maggie picks, Maggie told of Sarah's additions, before and after kept, only Maggie clears or reshares, shift screen order and off-shift hiding, audit |
| E2E — `sprint19.py` | *Maggie writes and shares Things I don't want* · *Ana sees her parts on shift* · *Sarah edits My day and can't see an unshared part* · *Maggie sees the change and turns Sarah's editing off* |
| Accessibility — `a11y.py` | Sarah's and Maggie's What matters to me |

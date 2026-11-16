# Code review — Sprint 13, CC-193: Architecture wiki caught up with Sprint 12

**Pull request:** [#6](https://github.com/sumanth1996/circle-care/pull/6) · **Reviewer:** Lead Architect · **Result:** Approved in round 2

## Scope

Documentation only: `docs/wiki/architecture/system-overview.md`, `docs/wiki/architecture/data-model.md`, the wiki menu (`mkdocs.yml`) and one line on the wiki home page. Both architecture pages were fact-checked in full against the code on `main`: types, the rules engine, permissions, routes, tabs, the server, the service worker, build scripts and Replit settings. The state version history was checked against git.

## Round 1: 13 findings

| # | Kind | Finding | Fix |
|---|---|---|---|
| 1 | Must fix | Service worker cache named `circle-care-v1` | Now `circle-care-v2`; `/api/*` and `/vault/*` never cached (CC-181) |
| 2 | Must fix | `chatAudience` described as who can read the chat | `chatMembers` reads; `chatAudience` is who is notified |
| 3 | Nice to have | Rule 11 conditions missing | From 9 AM, only after a meal in the 5 days before, private or unshared days never count |
| 4 | Nice to have | Rule 8 recipients and stop condition missing | To Sarah and Ana, until someone requests a refill |
| 5 | Nice to have | Chat health check shown only for Sarah and credited to CC-192 | Every message from anyone; CC-164, tuned in CC-192 |
| 6 | Nice to have | `supply` and `chat` permissions incomplete | Elder, guardian and family; chat closed to family and caregivers while sharing is paused |
| 7 | Nice to have | `autoCancelled` only for paused medicines | Paused or removed |
| 8 | Nice to have | Payment vault calls not mentioned | `/vault/*` in the diagram and the dependencies line |
| 9 | Nice to have | PGlite tied to environment | PGlite only when `DATABASE_URL` isn't set, never in production |
| 10 | Nice to have | Where `STATE_VERSION` lives | `src/data/demo.ts`; checked by `loadState()` in `store.tsx` |
| 11 | Nice to have | Sharing switch location unclear | In Privacy Center |
| 12 | Nice to have | Node version | Node 20.11+ (`engines`) |
| 13 | Nice to have | Home page still said static deployment | Autoscale deployment (staging) |

## Round 2

All 13 fixes confirmed against the code, no new errors. One optional wording change (the vault is mounted only with the simulated payment provider) was also taken.

## Checks

- `mkdocs build --strict` passes.
- No app code changed, so the app tests are unaffected.

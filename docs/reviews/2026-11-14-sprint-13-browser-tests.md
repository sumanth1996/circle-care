# Code review — Sprint 13, CC-194: Browser tests for family chat and evening recap

**Pull request:** [#7](https://github.com/sumanth1996/circle-care/pull/7) · **Reviewer:** Lead Architect · **Result:** Approved in round 3

## Scope

Tests and CI only, with no app code changed:

- `.github/workflows/browser-tests.yml` (new): unit tests, build, Playwright 1.49.1 with Chromium, `vite preview`, then the three browser scripts, with screenshots kept for 7 days.
- `tests/e2e/everyday.py` (new): 7 scenarios for CC-164, CC-165 and CC-191, with the clock pinned to a Wednesday at 4:30 PM ET.
- `tests/e2e/a11y.py`: adds both chat screens and an axe audit of the recap card after Skip to 7 PM.
- `tests/e2e/e2e.py`: exits with 1 on a failure or a page or console error.
- `server/__tests__/config-and-export.test.ts`: 20 s timeout on the three PGlite-backed tests.
- README and the [Quality & testing](../wiki/architecture/quality-and-testing.md) page updated for CI.

The PO chose GitHub Actions because the build environment can't install a browser.

## CI runs while building

| Run | Head | Result | What it found | Fix |
|---|---|---|---|---|
| 1 | `5123644` | 29/29 e2e, 5/7 new, 27 screens with 0 problems | Forced clicks on two settings switches landed on the fixed tab bar | `flip()` centres the switch, taps without force and checks the new state |
| 2 | `1ccddd2` | 6/7 new | The 7 PM switch came back after `reload()`: the app saves on a 250 ms timer and the save on page hide is async, so a quick reload loses the change | The test waits for the save; the app gap is backlog story CC-195 |
| 3 | `428c1ed` | Unit test timeout | A PGlite-backed server test passed 5 s on the shared runner (about 2 s locally) | 20 s timeout on the three PGlite tests |
| 4 | `24e36d1` | 6/7 new | `wait_for_function` is blocked by the app's CSP (`script-src 'self'`) | Poll with `page.evaluate` |
| 5 | `1008976` | All green | — | — |

The browser tests ran on the production build under its real CSP. Merging required a green run on the final head.

## Round 1: changes requested

| # | Kind | Finding | Fix |
|---|---|---|---|
| 1 | Must fix | The wait for the save could end on the app's 15 s tick save, before the switch was saved | Wait until saving has stopped for 0.6 s |
| 2 | Must fix | `e2e.py` didn't fail on page or console errors, though the wiki said it did | Exit with 1 on errors too |
| 3 | Must fix | The Her day privacy test would pass if the card always read Private | Check the shared counts before turning sharing off and after turning it back on |
| 4 | Must fix | The test cited a review record for the save gap that didn't exist | Backlog story CC-195 filed and cited |
| 5 | Nice to have | Browser steps ran even when the preview server never started | Gated on the server step; its log is printed on failure |
| 7 | Nice to have | README and wiki out of date | Updated, including the Playwright version |
| 9 | Nice to have | Fake speech text built with Python `%r` | `json.dumps` |
| 10 | Nice to have | The timeout covered whole describe blocks | Only the three PGlite tests |
| 11 | Nice to have | A recap audit error would abort the whole report | Recorded as `ERR` like the other screens |

## Round 2: one item

The results table on the Quality & testing page still showed the v0.4 numbers. It now shows the Sprint 13 numbers, and the stale wall-clock gap is removed.

## Left for later stories

- Pin actions to commit SHAs, move to Node 22 and `ubuntu-24.04`, `persist-credentials: false`, and don't cancel in-progress runs on `main`.
- More acceptance criteria in the browser: Send anyway and Edit on the health-detail sheet, the 1000-character limit, Ana's alerts and access log, adding Ana to the chat, typing when there's no speech recognition, the 7 PM alert, an exact recap headline, and the 22 px floor at Maggie's smallest text size.
- Check that the unread count goes up by one, check the caregiver tab bar renders before the "no Chat tab" check, and filter console errors by URL.
- Audit the recap with amber states and the open health-detail and "You said" sheets.
- Use `flip()` for the four forced switch clicks in `e2e.py`.
- CC-195: keep a change made just before the tab closes.

# Code review — Sprint 14, CC-198: Harden the Browser tests workflow

| | |
|---|---|
| Branch | `claude/project-thread-0da4wd` → `main` ([PR #10](https://github.com/sumanth1996/circle-care/pull/10)) |
| Approver | **Lead Architect Agent** (independent AI review agent) |
| Developer · Tester · Build & Deploy | Dev Agent · QA Agent · Release Agent |
| Product Owner | Sumanth (PO), go to start CC-198 given 2026-11-15 |
| Date | 2026-11-15 |
| Final verdict | **APPROVED** (round 2, after one round of changes) |

## What changed

- `.github/workflows/browser-tests.yml` pins every outside action to a full commit SHA with its release in a comment: checkout v7.0.1, setup-node v7.1.0, setup-python v7.1.0 and upload-artifact v7.0.2.
- Checkout keeps no token (`persist-credentials: false`). Nothing later in the job uses git.
- The job runs Node 22 on `ubuntu-24.04`.
- Only pull-request runs share a concurrency group by branch and cancel an older run. Every other run, on `main` or on demand, gets a group named by its own run id, so it is never cancelled or dropped while it waits.
- `src/__tests__/ci-workflow.test.ts` (6 tests) fails if a pin goes back to a tag, any checkout keeps its token, a write permission or secret appears, Node 22 or the runner changes, the concurrency rule changes, or a test suite is removed or skipped.
- Threat C8-T1 (a changed outside action alters what runs) is now In place, Low risk. The wiki's testing page describes the hardened job and how to update a pin.

## Round 1 — CHANGES REQUESTED

| # | Finding | Fix |
|---|---|---|
| 1 | Must: pushes to `main` shared one group, so a newer push could still drop a run waiting in the queue | Runs outside a pull request get a group named by their run id |
| 2 | Should: the pins stayed on old majors that run on the retired Node 20 actions runtime | Moved to the newest releases; the reviewer checked each one's inputs at the pinned tag |
| 3 | Should: the read-only check failed on any word "write" | Checks only `key: write` lines and `write-all` |
| 4 | Should: the checkout check passed if any one checkout had the setting | Every checkout step's own `with:` block is checked |
| 5–7 | Nits: `if: ${{ false }}` slipped past, the test checks format not that a SHA matches its release, and the wiki credited the test count to PR #7 | Caught; the wiki says how to update a pin; count credited to PR #10 |
| 8 | Nit: Node 20 is still named in `.replit`, `README.md`, `package.json` and the system overview page | Follow-up story CC-221, with Dependabot for the action pins |

## Round 2 — APPROVED

Approved with nits: confirm the GitHub check is green on the v7 actions before merging, accept a quoted `"false"` for `persist-credentials` (done), and file the Node follow-up (CC-221).

## Results

- `npm test`: 475 passed, 2 to-dos (CC-199).
- `tsc --noEmit` for client and server: clean.
- `mkdocs build --strict`: clean.
- Browser tests on GitHub Actions: see the check on PR #10.

# How to contribute

This wiki is plain Markdown in the repository, built with [MkDocs](https://www.mkdocs.org/) and the [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) theme. Anyone who can open a pull request can edit it.

## Run the wiki locally

From the repository root:

```bash
pip install -r docs/requirements-docs.txt && mkdocs serve
```

Open <http://127.0.0.1:8000/circle-care/>. Pages reload as you save.

Before opening a pull request, build in strict mode — it fails on broken links, missing anchors and pages left out of the navigation:

```bash
mkdocs build --strict
```

The built site goes to `site/` (git-ignored).

## Publish

The site is published to GitHub Pages at <https://sumanth1996.github.io/circle-care/> by the maintainer:

```bash
mkdocs gh-deploy
```

This builds the site and pushes it to the `gh-pages` branch. There is no automatic deployment.

## Where things live

| Path | Contents |
|---|---|
| `mkdocs.yml` | Site settings and **navigation** — add every new page here |
| `docs/index.md` | Wiki home |
| `docs/wiki/product/` | Personas, demo guide, glossary, release notes, FAQ |
| `docs/wiki/features/` | One page per feature area |
| `docs/wiki/architecture/` | System overview, data model, security, testing |
| `docs/wiki/roadmap.md`, `traceability.md`, `research-and-compliance.md` | Cross-cutting pages |
| `docs/wiki/assets/screens/` | Screenshots (`.webp`) |
| `docs/wiki/assets/wiki.css` | Small style additions (screenshot frame, status badges) |
| `docs/research`, `docs/compliance`, `docs/security`, `docs/pilot` | Working drafts (linked under *Research & Compliance*) |
| `docs/README.md` | GitHub index of the working drafts; excluded from the built site |

## Feature page template

Copy this skeleton for a new feature page. Keep every heading, even if a section says "None".

```markdown
# Feature name

<div class="cc-meta" markdown>

| | |
|---|---|
| **Feature ID / area** | F-nn · Area |
| **Personas** | … |
| **Status** | <span class="cc-badge cc-badge--built">Built in prototype</span> |
| **Related stories** | CC-n title · … |
| **Last updated** | YYYY-MM-DD |

</div>

## Overview
## User journey
## Functional details & business rules
## Permissions & privacy
## Notifications
## Accessibility
## Data captured
## Edge cases & error states
## Test coverage
## Known limitations & production gaps
## Related pages
```

Status badges: `cc-badge--built` (Built in prototype), `cc-badge--partial` (Partially built), `cc-badge--planned` (Planned).

## Writing guidelines

- **Audience:** someone who has never heard of Circle Care. Define terms or link to the [Glossary](product/glossary.md).
- **Plain English, no hype.** Short sentences. Active voice.
- **Be accurate to the code.** Quote UI labels exactly, in **bold** for buttons and *italics* for on-screen text. Check thresholds and timings in the source. If the wiki and the code disagree, the code wins — fix the wiki.
- **Separate today from tomorrow.** Use "In the prototype" for what the code does and "In production (planned)" for what is not built. Never describe the prototype as production-ready.
- **Fictional data only.** Never add real names, health details or contact information.
- **Admonitions:** `!!! note`, `!!! info`, `!!! warning`, `!!! tip`. Use `note` for privacy points.
- **Diagrams:** fenced ` ```mermaid ` blocks.
- **Traceability:** reference stories as `CC-n`, and update the [Traceability matrix](traceability.md) when a page gains or loses a story.

## Screenshots

- Save as `.webp` in `docs/wiki/assets/screens/`, named `area-screen[-variant].webp` (e.g. `guardian-home-mobile.webp`).
- Use relative paths and the figure pattern with descriptive alt text, a caption and lazy loading:

```markdown
<figure markdown="span">
  ![Describe what is on screen for someone who cannot see it](../assets/screens/guardian-home.webp){ loading=lazy }
  <figcaption>One sentence on why this screen matters.</figcaption>
</figure>
```

- Add `class="cc-phone"` to the `<figure>` for phone-sized captures; wrap two figures in `<div class="cc-pair" markdown>` to show them side by side.
- Use fictional demo data, reset the demo first, and mention anything unusual in the caption.

## Naming conventions

| Item | Convention | Example |
|---|---|---|
| Page files | lower-case, hyphenated | `caregiver-shifts-and-handoffs.md` |
| Feature IDs | `F-nn` in catalogue order | F-05 |
| Story IDs | `CC-n` as in Notion | CC-58 |
| Release labels | `vN` for prototype increments; `Release N` for roadmap releases | v0.4, Release 3 |
| Personas | Elder, Caregiver (professional), Family, Legal guardian, Review team | — |
| Code references | Path from `src/` in `monospace` | `src/data/policy.ts` |

## Review process

1. Create a branch and make your change.
2. Run `mkdocs build --strict` until it passes with no warnings.
3. Open a pull request describing what changed and why; link the Notion story if there is one.
4. **Reviewers:** the Product Owner (Sumanth) approves every change. Changes to security, privacy or compliance pages also need review by whoever owns that area (security officer / counsel once appointed).
5. Check accuracy against the code, tone, screenshots and links.
6. Merge; the maintainer publishes with `mkdocs gh-deploy`.
7. Update *Last updated* on each feature page you changed and add a line to the [Release notes](product/release-notes.md) if behaviour changed.

## Document control

| Field | Value |
|---|---|
| Owner | Sumanth — Product Owner (CSPO) |
| Version | 1.0 |
| Date | 2026-10-19 |

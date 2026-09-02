---
name: interactive-poc
description: >-
  Build one self-contained, offline, clickable HTML prototype of a single slice of a
  requirement, styled with a real design system and driven by mocked logic. Use when the
  user wants an interactive demo, POC, pitch prototype, or clickable mockup generated from
  a doc, ticket, PRD, or user story — especially for a live/in-person walkthrough. Not for
  production UI or anything needing real integrations.
---

# interactive-poc

Follow **`METHOD.md`** — the canonical method. Find it next to this file, three levels up
(`../../../METHOD.md`) in the `poc-toolkit` repo, or at
<https://github.com/havesomeleeway/poc-toolkit/blob/main/METHOD.md>. This skill is a thin driver;
the deterministic work is the **`poc-kit`** CLI (`npm install -g poc-kit`, then `poc-kit …`).

The toolkit supplies process, scaffolding and checks only. **The prototype's screens,
interactions, mocked logic and any export path come entirely from the requirement and the user's
direction — presume none of them.**

## Workflow

1. **Ingest & pick one slice.** Read the requirement source. Choose one story/journey by the
   rubric in `METHOD.md` §1 (legible to a non-expert, interactive, on-message, buildable with no
   integrations, fits the scope). **Propose the slice + screen list and confirm before building.**
2. **Decide the actor.** If multiple roles are named, work out who operates this screen; give a
   reasoned soft conclusion; **STOP and let the user decide** (`METHOD.md` §2).
3. **Research patterns** for this flow — structure, not styling; keep references (`§3`).
4. **Acquire the design system:** `poc-kit add-ds <npm | url | --none>`, optionally
   `poc-kit add-font …`. Build against the class names in `vendor/ds-report.md` (`§4`).
5. **Scaffold & build:** `poc-kit init .`, fill `prototype.src.html` with only the screens the
   slice needs, then `poc-kit build` (`§5`).
6. **Mock the logic** — deterministic, inspectable, visibly illustrative, never fake precision
   (`§6`).
7. **Follow the design system's own guidance** for layout/nav/status/actions; use
   `references/consistency.md` as a *what-to-decide* checklist, not a set of values (`§7`).
8. **Verify by driving it:** author `flow.json`, run `poc-kit verify`. Zero console errors is a
   gate. Fix, re-run, read the screenshots (`§8`).
9. **Hand off:** `poc-kit handoff`, then fill in what the audience needs (`§9`).

## STOP points

- After step 1 — confirm the slice and screen list.
- After step 2 — the actor/persona is the user's call.
- Do not add any feature (export, extra screens, integrations) the requirement does not ask for.

## References

- `references/use-case-selection.md` — the slice rubric, expanded.
- `references/consistency.md` — decisions to make once and keep consistent (not mandated values).
- `references/mock-logic.md` — how to fake logic without faking precision.
- `references/verification.md` — writing `flow.json`; reading failures.

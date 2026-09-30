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

Follow **`METHOD.md`** (next to this file, three levels up, or
<https://github.com/havesomeleeway/poc-toolkit/blob/main/METHOD.md>). The CLI is `poc-kit`
(`npm install -g poc-kit`). Screens, interactions, mocked logic and any export path come only from
the requirement and the user — presume none.

## Workflow (details in METHOD §1–9)

1. **Pick one slice** and its screen list (§1).
2. **Decide the actor** — give reasons, the user chooses (§2).
3. **Research patterns** — structure, not styling (§3).
4. **Acquire the design system:** `poc-kit add-ds --profile <shared>` or `poc-kit add-ds <npm | url | ./x.css | --none>`; optional `poc-kit add-font`; look components up with `poc-kit ds lookup` / `poc-kit ds search` (§4).
5. **Scaffold, build, tag:** `poc-kit init .`, tag as in §5, `poc-kit build` until it passes (§5).
6. **Mock the logic** (§6).
7. **Let the design system lead** (§7).
8. **Verify by driving it:** `flow.json`, `poc-kit verify` (§8).
9. **Hand off:** `poc-kit handoff` (§9).

## STOP points

- After step 1 — confirm the slice and screen list.
- After step 2 — the actor is the user's call.
- A draft design-system profile — tell the user it needs a one-time review.
- Never add a feature (export, extra screens, integrations) the requirement doesn't ask for.

## References (read when the step needs them)

- `references/use-case-selection.md` — step 1 · `references/consistency.md` — step 7 ·
  `references/mock-logic.md` — step 6 · `references/verification.md` — step 8

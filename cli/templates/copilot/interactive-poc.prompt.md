---
mode: agent
description: Build one offline, clickable HTML prototype of a single slice of a requirement — real design system, mocked logic, verified by driving it.
---

# interactive-poc

Build **one self-contained, offline HTML file** demonstrating **one slice** of a requirement,
styled with the **real** target design system and driven by **mocked** logic. This mirrors the
team's `METHOD.md` (in the `poc-toolkit` repo). The deterministic work is the **`poc-kit`** CLI
(`npx poc-kit …`).

The toolkit supplies process, scaffolding and checks only. **The prototype's screens,
interactions, mocked logic and any export path come entirely from the requirement and my
direction — presume none of them.** Do not add features I did not ask for.

## Ask me first if not provided

- The **requirement source** (file path or pasted text).
- The **purpose, audience and time budget** (e.g. "2-min in-person pitch").
- The **design system** (npm package name, a CSS URL, or "none").

## Steps

1. **Pick one slice.** Read the requirement. Choose one story/journey: legible to a non-expert,
   interactive (something recomputes on input), on-message, buildable with **no integrations**,
   fits the time budget. **Propose the slice + a numbered screen list and wait for my confirmation.**
2. **Decide the actor.** If multiple roles are named, tell me who you think operates this screen
   and why, then **let me choose**.
3. **Research patterns** for this flow — borrow structure, not styling; note a couple of
   references.
4. **Acquire the design system:**
   `npx poc-kit add-ds <npm | url | --none>` then optionally `npx poc-kit add-font "<Family>"`.
   Build against the class names in `vendor/ds-report.md`.
5. **Scaffold & build:** `npx poc-kit init .`, fill `prototype.src.html` with only the screens the
   slice needs, then `npx poc-kit build`.
6. **Mock the logic:** deterministic, inspectable, clearly labelled illustrative, never fake
   precision (no invented IDs/decimals, no real names).
7. **Follow the design system's own guidance** for layout, navigation, status and actions. Decide
   cross-screen conventions once and keep them consistent.
8. **Verify by driving it:** write `flow.json` (steps: `click`, `setValue`, `expectVisible`,
   `expectText`, `expectNoConsoleErrors`, `screenshot`), run `npx poc-kit verify`. **Zero console
   errors is a gate.** Fix and re-run until it prints `PASS`; then review the screenshots in
   `out/`.
9. **Hand off:** `npx poc-kit handoff`, then fill in `HANDOFF.md` — what's real vs mocked, how to
   run and rebuild, known gaps.

## Do not

- Add an export/print path, extra screens, persistence, or any integration the requirement does
  not call for.
- Approximate the design system by eye instead of using `add-ds`.
- Claim it works from a screenshot — only from a green `poc-kit verify`.

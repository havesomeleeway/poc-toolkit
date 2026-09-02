# METHOD — interactive POC from a requirement

The canonical methodology. The Claude Code skill and the Copilot prompt both mirror this file —
edit here, not in the adapters.

**What this method produces:** one self-contained, offline HTML file demonstrating **one slice** of
a requirement, styled with the **real** target design system, driven by **mocked** logic, and
**verified by driving it** in a headless browser.

**What this method does *not* decide:** which screens exist, how they navigate, what the logic
computes, whether there is an export/print path, what the copy says. All of that comes from the
requirement and the user's direction for this build. `poc-kit` and this method supply process,
scaffolding and checks — never house style or features.

The deterministic work is done by the `poc-kit` CLI (`cli/`). The steps below say when to call it.

---

## 1. Ingest & pick one slice

Read the requirement source (`.docx` / `.xlsx` / `.md` / `.txt` / pasted text). If it is large,
extract the specific story/journey plus any surrounding context that defines roles, rules or prior
decisions.

Choose **one** slice against this rubric:

- **Legible** — someone with no domain knowledge grasps it in the room.
- **Interactive** — something visibly responds to input; not a static screen.
- **On-message** — it demonstrates the thing the demo exists to prove.
- **Buildable with no integrations** — mock everything; if it can't be faked convincingly, pick
  another slice.
- **Fits the scope** — a 2-minute pitch is 3–7 screens; a longer walkthrough can be more.

**Propose the slice and the screen list, then confirm with the user before building.**

## 2. Decide the actor / persona

If the requirement names multiple roles, work out **who operates this screen**. Cross-check the
role names against role definitions elsewhere in the source and any prior artefacts. Write a short
conclusion *with reasons*.

**STOP and let the user make the call.** Getting the actor wrong makes the whole demo wrong, and
it is the user's decision, not yours.

## 3. Research patterns for this flow

Find real products that solve an analogous task. Borrow **structure** — what's on the screen, in
what order, what responds to what — **not styling**. Keep a few references so the choices are
defensible. Do not invent novel interaction patterns for a POC.

## 4. Acquire the design system — offline

```
poc-kit add-ds <npm-name | https://…/x.css | --none>
poc-kit add-font <family | ./file.woff2>        # optional
```

`add-ds` downloads the real stylesheet into `vendor/` and writes `vendor/ds-report.md` — the
actual class names and custom properties. **Build against names that exist in that report.** Do not
approximate the design system by eye. Use `--none` (the neutral kit) only when there genuinely is
no design system.

`add-font` base64-embeds a font so the file stays offline. Skip it to use a system-font stack.

## 5. Scaffold & build the screens

```
poc-kit init .        # bare skeleton: header/footer slots, screen router, build markers
```

Fill `prototype.src.html` with exactly the screens and behaviours the slice needs — nothing the
requirement does not ask for. The skeleton's `showScreen()` / `[hidden]` router and `data-nav`
convention are there to extend; replace them if the flow needs something else.

```
poc-kit build         # inlines vendor/* into the markers -> prototype.html, then lints offline
```

## 6. Mock the logic

Any behaviour the flow needs — calculations, lookups, state, "results" — is faked:

- **Deterministic** — same inputs, same output, every run.
- **Inspectable** — a reader can see how a number was reached if the requirement calls for that;
  keep the model small.
- **Visibly illustrative** — label outputs as estimates / sample data. Never present a mocked
  number as if it were accurate.
- **Never fake precision** — no fabricated decimal places, no made-up reference IDs presented as
  real.

How much logic exists, and how much of it is shown on screen, is set by the requirement.

## 7. Let the design system lead

The chosen design system's own guidance decides layout, navigation, status treatment, primary
actions, and any export styling. Where it is silent **and** the use case has no opinion, pick a
sensible default and note it in `HANDOFF.md`.

`references/consistency.md` is a checklist of decisions to **make once and keep consistent across
screens** (primary-action placement, how state is shown, keyboard/focus behaviour, whether the
requirement's provenance is surfaced). It lists *what to decide*, not *what to choose*.

## 8. Verify by driving it

Write a `flow.json` that clicks through the screens you built and asserts what should be true
(`expectVisible`, `expectText`, `expectNoConsoleErrors`, `screenshot`). Then:

```
poc-kit verify
```

- **Static checks always run:** offline-safety lint + inline-script syntax.
- **With Chrome present:** the flow runs, plus an advisory a11y smoke; screenshots land in `out/`.
- **Without Chrome:** prints `DEGRADED` and passes on the static checks alone.

**Zero console errors is a gate.** A screenshot is not proof — the click-through is. Fix and
re-run until green; then look at the screenshots.

A build that has an export path can add a `{ "pdf": "out/<name>.pdf" }` step to `flow.json`; the
runner treats it as a generic capture, nothing more.

## 9. Hand off

```
poc-kit handoff        # blank HANDOFF.md skeleton
```

Fill in what the audience needs — what's real vs mocked, how to run it, how to rebuild it, known
gaps — and a walkthrough if there will be a live demo. Format and depth are the user's call.

---

## Boundaries — when not to use this method

- Needs real backend/integration behaviour → build a real spike instead.
- Needs pixel-perfect production UI → hand to design / front-end.
- Multi-flow, multi-week POC → this is one flow, one sitting.

## The durable principles (all this method actually enforces)

1. One self-contained file, offline by default.
2. One slice, done deep — not a broad shallow wireframe set.
3. Mocked logic is deterministic, inspectable, visibly illustrative — never fake precision.
4. The real design system, acquired not approximated — and its guidance leads.
5. Verify by driving it — flow assertions + zero console errors.
6. Hand off with a "real vs mocked / how to run" note attached.

Everything else is a per-build decision.

# poc-kit proposal: token-cost optimizations for agent-driven usage

## Context

This is a write-up to hand to the `poc-kit` repo (`github.com/havesomeleeway/poc-toolkit`), not an
implementation task for this repo — `poc-kit` is a dependency (`node_modules/poc-kit`), and the
user will carry this document into that project directly. A prior discussion already produced a
list of functional gaps found while using `poc-kit verify` against this project's `flow.json`
this session (missing step types, no dark-mode pass, the offline-safety linter's false positives
on citation URLs, etc.) — that list is summarized in §1 for reference, not repeated in full. This
document adds a second, distinct angle the user asked for explicitly: **how `poc-kit` costs
tokens when an LLM agent (not a human) is the one driving it**, and what to change about the tool
itself to reduce that cost. Every item below is grounded in something that actually happened in
this session, not a hypothetical.

## 1. Prior functional suggestions (reference only — full detail already delivered separately)

1. Offline-safety linter can't distinguish a citation URL (plain text, never fetched) from a real
   network reference — hard-fails on both identically.
2. `eval` flow steps can only assert pass/fail, never record a measured fact for a report.
3. No dark-mode re-run pass, despite the mobile-viewport re-run pass being the exact right
   pattern to copy (`verify.mjs` lines 83-93).
4. No sticky/fixed-position (or general computed-style) discovery primitive.
5. No `hover`, `scroll`, or `dispatchEvent` step types — every one required a raw `eval` string.
6. `flow.json` is one monolithic, unscoped file with no way to re-run part of it.
7. `verify`'s final PASS/FAIL head has no numeric tally.

## 2. Token-cost problem, specifically

An agent (Claude Code or similar) using `poc-kit` pays tokens three ways: **reading command
output** back into its own context every time it runs a CLI command, **reading files** it opens
to investigate a failure, and **viewing screenshots** it needs to check visually. `poc-kit`'s
current design was clearly built for a human reading a terminal — verbose by default, one huge
flow file, unfiltered output — which is exactly backwards for an agent, where every line read
back is a real, metered cost repeated on every iteration of an edit-test loop. The fixes below
target each of those three costs directly.

## 3. Proposed changes

### 3.1 `--quiet` / failures-only output mode (cheapest fix, likely biggest win)

**Problem, with real numbers:** this session's `poc-kit verify` run against a ~70-step
`flow.json` printed an `ok`/`FAIL` line for *every* step, passing or not — about 90 lines total,
almost all of them "ok" lines an agent gains nothing from re-reading on each of the many times
`verify` gets re-run during a debug loop. Multiply by the automatic mobile-viewport re-run
(`verify.mjs` lines 83-93) and it's closer to 180 lines per invocation.

**Fix:** a `--quiet` flag (or default-on when `process.env.CI`/a `--agent` flag is set) that
prints only `head()` section titles, `FAIL`/`warn` lines, and a final numeric tally (see §3.2) —
suppressing individual `ok` lines entirely. Human interactive use keeps today's verbose default;
add the flag, don't change the default.

### 3.2 Numeric pass/fail tally at the end of `verify`

**Problem:** `verify.mjs`'s final `head(staticOk && driveOk ? 'PASS' : 'FAIL')` (line 95) is
binary — to know *how much* broke, an agent has to count `FAIL` lines itself by re-scanning the
output it already paid to read once.

**Fix:** one line, e.g. `62 passed, 14 failed (3 advisory)`, computed from the same `results`
array `runPass()` already iterates (line 63). Trivial to add, and combined with §3.1 it means a
clean run costs an agent ~3 lines to confirm instead of ~90.

### 3.3 Diff-against-last-run mode

**Problem:** the real cost driver in an agentic loop isn't one `verify` call, it's dozens across
a session (this project's session ran it repeatedly while iterating). Once a flow is mostly
passing, re-reading 90+ lines every time to confirm "yes, still the same 3 things are broken" is
pure waste — the agent already knows most of that from the last call.

**Fix:** cache the last run's per-step results (a small JSON file, e.g. `.poc-kit/last-run.json`)
and add `--diff` to print only steps whose pass/fail status *changed* since that cache, plus a
one-line count of unchanged steps ("61 unchanged"). This is the single highest-leverage change
for a long agent-driven edit-test loop specifically, more valuable here than in the human-terminal
case `poc-kit` was originally designed around.

### 3.4 Structured `--json` output

**Problem:** everything `verify` reports is prose meant for a terminal. An agent that wants to
act on specific failures (e.g., "list every selector that's missing") has to parse loosely
structured text instead of reading a value.

**Fix:** a `--json` flag emitting `{ staticOk, driveOk, results: [...], consoleErrors: [...],
tally: {...} }` — the same data `runPass()` already has in memory (`results`, `consoleErrors`,
`artifacts`), just serialized instead of printed. Pairs naturally with §3.1/§3.3: an agent can
request `--json --diff` and get the smallest possible payload that still answers "what changed."

### 3.5 Trim the offline-safety violation report itself

**Problem:** each violation line in `lint-offline.mjs`'s `printReport()` includes up to a
120-character raw text snippet (`hit.text.slice(0, 120)`, `lintOffline` line 30). With the false
positives from §1.1 (13 citation-URL hits in this session alone), that's over 1,500 characters of
raw HTML dumped into the agent's context for violations that, once §1.1 is fixed, mostly
shouldn't even be reported.

**Fix:** once §1.1 lands (a real allowlist mechanism), this mostly resolves itself — the
remaining genuine violations are rare enough that verbose lines are fine. If §1.1 is deferred,
consider truncating the snippet further (40-60 chars is enough to identify a line) as a
stand-alone cheaper interim fix.

### 3.6 Constrain screenshot size/format for agent review

**Problem:** this session, screenshots were reviewed dozens of times (via an image-reading tool)
across the Review Queue, Investigation Workspace, Backtesting, and multiple modal states — each
one at full-page PNG resolution. Vision-token cost scales with image size/resolution, and nothing
in `flow.schema.json`'s `screenshot` step lets a flow author say "this one's just for a quick
visual sanity check, keep it small."

**Fix:** let a `screenshot` step optionally carry `"clip"` (a region, CDP's `Page.captureScreenshot`
already accepts this) and/or `"maxWidth"`/`"format":"jpeg"` — cheaper defaults for routine
sanity-check shots, full-resolution PNG still available when a step actually needs pixel-level
detail (e.g. a contrast or alignment check).

### 3.7 A queryable-selector / computed-style CLI escape hatch

**Problem, with a real incident:** this session, grepping the built single-file prototype for a
CSS rule repeatedly dumped a 100KB+ single minified line into context (one such grep hit a
133.1KB output-size truncation), because `poc-kit build` inlines vendor CSS onto one line and
there's no tool-level way to ask "what does selector X actually resolve to" without reading the
whole file. This is a `poc-kit`-shaped problem, not a one-off: any single-file POC built by this
tool will hit the same wall the moment an agent needs to inspect its own inlined CSS.

**Fix (two options, either helps):**
- **(a)** `poc-kit query --selector ".foo"` — launches the same headless Chrome `verify` already
  uses, evaluates `getComputedStyle`, and prints just the matched declarations. Small, exact,
  cheap.
- **(b)** `poc-kit build --pretty` (or a second `--emit-readable <path>` output) — keep the single
  shippable file as-is, but also write a non-minified sibling copy for exactly this kind of
  inspection, so grep/read tools never have to touch the packed version at all.

(a) is the more direct token-cost fix; (b) is cheaper to implement and helps human debugging too.

### 3.8 Consolidate the desktop/mobile (and future dark-mode) passes into one report

**Problem:** `verify.mjs` already runs the flow twice (desktop, then mobile via `mobileCheck`,
lines 83-93) as two separate headed sections in one command's output. Adding the dark-mode pass
proposed earlier (§1.3) would make three. Each is a separate `head()` block with its own
`ok`/`FAIL` lines — reasonable for a human scanning a terminal, but for an agent every additional
pass is more lines of a single command's output to read, even though most of it is the same 60+
steps repeating passes/fails per condition.

**Fix:** report as one table keyed by step, with a column per condition (desktop/mobile/dark),
rather than three sequential full reprints — a step that passes in all three conditions is one
row, not three. Combine naturally with §3.1 (quiet) and §3.3 (diff) so the common case ("nothing
changed, still passing everywhere") stays a one-line summary regardless of how many conditions
get added over time.

## 4. Lean design-consistency tooling (no Storybook, no component library)

**Problem, with real incidents from this session:** repeatedly asking for one screen's component
to "match" another's — a status/priority/evidence chip that turned out to be three different
CSS recipes (`.badge--*` at one padding/radius/font-size, `.chip--*` at another, `.actorchip` at
a third, all doing the same visual job), and a timestamp label that looked different on the Audit
trail than the identical-purpose one on the Evidence rail (`.tl-when` vs `.chrono-group-label`).
Neither was a design *decision* — both were drift: the same concept got authored twice, at
different times, with no mechanism forcing the second author (agent or human) to notice the first
already existed. `poc-kit`'s whole premise is a single offline file with no build pipeline for
consumers, so a real Storybook/component-library setup would fight the tool's own philosophy —
but "no tooling at all" is what let this drift happen twice in one project. The lean middle
ground: catch drift with the same static-analysis approach `lint-offline.mjs` already uses,
not a new subsystem.

**Proposed fixes, cheapest first:**

- **4.1 — A `HANDOFF.md`/`copilot` prompt checklist step: "does this already exist?"**
  `templates/HANDOFF.md` and the Copilot instructions (`copilotInit.mjs`) already tell an agent
  how to extend the prototype. Add one explicit step: before authoring a new visual pattern
  (a badge, a label, a card), grep the existing CSS for classes with a similar job (shared
  property shape: `border-radius` + `padding` + `font-size` clustered together is almost always
  a "chip/badge/pill" family) and reuse or extend rather than add a fourth variant. Pure
  documentation, zero code, and it would have caught both incidents this session if it'd existed.

- **4.2 — A static "duplicate recipe" lint, alongside `lintOffline()`.**
  Extend the same static-analysis pass `verify`'s `static: offline-safety` check already runs
  (`lint-offline.mjs`) with a sibling check: parse the shipped `<style>` block's rules, group them
  by declared property *set* (not value — e.g. any rule declaring `padding`+`border-radius`+
  `font-size`+`font-weight` together, regardless of the actual numbers), and warn when more than
  one differently-named class shares that shape. This is exactly the `.badge--*`/`.chip--*`/
  `.actorchip` situation from this session — three classes, same four properties, three different
  value sets — and it's a pure static/offline check, no browser needed, consistent with how
  `lint-offline.mjs` already works today.

- **4.3 — Turn the existing `verify` screenshots into a free style-guide page.**
  `poc-kit` already screenshots named states via the flow's `screenshot` step. A `flow.json`
  convention — one step block that visits one live instance of every declared component variant
  and screenshots them together — gives a cheap, always-current "these are the badges/labels
  that exist today" reference for free, without maintaining a second Storybook toolchain. This
  reuses machinery `poc-kit` already has (§3.6's cheaper screenshot options make this affordable
  to run often) rather than adding anything new.

- **4.4 — Extend `introspect-ds.mjs` to introspect the *prototype's own* CSS, not just the
  acquired design system.** `introspect-ds.mjs` already exists to understand a design system's
  tokens after `add-ds`. Point that same introspection at the built prototype's own authored
  `<style>` block after `build`, and surface author-created "recipe" classes (anything matching a
  common component-ish naming pattern — badge/chip/tag/pill/label) as a short list in `verify`'s
  output. An agent working on screen 5 of a project can then see "these recipes already exist"
  in one glance instead of re-deriving it by reading the whole file — directly reusing existing
  machinery rather than building a new one.

Recommended order: **4.1 (docs, ships same day) → 4.2 (the actual drift-catcher) → 4.4 → 4.3**.
4.1 is free and should land regardless of the others; 4.2 is the one that would have mechanically
caught both real incidents from this session without relying on anyone remembering to check.

### 4.5 — None of this is enforced anywhere today; a lint nobody has to run doesn't run

Checked both layers on this actual project: no git hooks beyond the default `.sample` stubs, no
CI workflow, no `scripts` field in `package.json` — `poc-kit verify` only ever ran this session
because we typed it ourselves. And `poc-kit init`/`copilotInit` don't scaffold anything that would
run it automatically either, upstream. That means §4.2's drift-catcher (or any of `verify`'s
existing static checks, offline-safety included) is opt-in: it only helps if someone remembers to
invoke it at the right moment, which is exactly the condition under which the badge/timestamp
drift went unnoticed as long as it did.

**Fix — `poc-kit init` should offer to wire up enforcement, not just leave it documented:**
- A `--hooks` flag (or a prompt during `init`) that drops a pre-commit hook (plain shell, no
  Husky dependency needed — `poc-kit` has no other runtime deps beyond
  `chrome-remote-interface`) running the **static-only** checks (`lint-offline` + the §4.2
  recipe-shape check + inline-script syntax) — these need no browser, so they're fast enough for
  a commit-time gate. Leave the full Chrome-driven `verify` flow for CI, not pre-commit, since
  launching a browser on every commit is the kind of friction that gets `--no-verify`'d away.
- A ready-made CI workflow template (e.g. `templates/ci-github-actions.yml`, dropped by `init` or
  documented in `HANDOFF.md`) running the full `poc-kit verify` on every push/PR — this is where
  the browser-driven flow and its screenshots belong.
- Ship both as opt-in scaffolding from `init`, not a silent default — a generated hook a team
  didn't ask for is the kind of thing that gets deleted the first time it's inconvenient.

Without this, §4.1-4.4 are all still just documentation and tooling that *exist* — 4.5 is what
makes them actually run.

## Priority for a first PR

Highest value-to-effort, in order: **§3.1 (quiet mode) → §3.2 (tally) → §3.3 (diff mode) → §3.7a
(query command)**. All four are additive (no change to default human-facing behavior), each is
independently useful even if the others aren't picked up, and together they're the difference
between an agent-driven edit-test loop reading ~180 lines per iteration versus ~5.

For the design-drift problem specifically (§4), start with **4.1 → 4.2 → 4.5** — a documentation
nudge and a mechanical static check, both consistent with `poc-kit`'s existing offline/no-build-
step philosophy rather than importing a component-library toolchain, plus the pre-commit hook
that actually makes sure 4.2 gets run. A lint with no enforcement is a suggestion, not a check.

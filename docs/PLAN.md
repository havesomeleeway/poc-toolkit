# Plan: consistent prototypes and a stack-neutral handoff

Status: steps 0–2 done; paused before step 3. Branch: `claude/eager-goldberg-zeld2b`.

## The two problems

1. **Drift.** The same prompt gives different results. The AI is *asked* to reuse the design
   system, but nothing checks that it did.
2. **Weak handoff.** Developers get `prototype.html`, and their agent has to reverse-engineer it.
   The developers may build on any stack (iOS, Angular, React, anything), so the handoff cannot
   assume a framework.

Inspiration: Stripe's Sail CLI (Katie Dill, "How to scale intent, quality, and artistry with AI").
Their lessons were: a CLI makes the AI more obedient than docs alone; look up docs at the moment
they're needed to avoid context rot; ship templates and flows, not just components.

## Principles

- **Enforce with the tool, don't just ask the AI.** If a rule matters, `build` or `verify` checks it.
- **Look things up on demand.** The AI fetches one component's facts when it needs them, instead of
  reading one big report.
- **Capture intent while building.** Each element records what it *is* when it's written.
- **The handoff says what, not how.** No HTML, CSS or framework terms in the spec.
- **`prototype.html` is a visual reference only.** `spec.json` is the main deliverable.
- **The handoff is written for machines first.** A developer's agent reads it, so it is structured,
  split by unit of work, free of repetition, and measured in tokens. People get a short summary and
  can render any part as text on demand.
- **Shared knowledge is written once.** Design-system profiles and mapping files are maintained per
  design system / target stack and reused across projects, not rebuilt per prototype.

## Decisions made

- The linter **blocks** the build from day one (with a recorded `--allow` escape hatch).
- The build order below is the order of work.
- No Storybook and no framework-specific generator in the core. The downstream stack can be
  anything.
- The handoff names the design system and its components explicitly.
- A shared mapping file links design-system components to a target stack's components. Both
  poc-kit and developers use the same file.
- Handoffs are **incremental**. A prototype is one project that changes over time (features 1–10,
  then 1–11, then 2–11). Each handoff is a numbered revision, and developers get the list of changes
  since any earlier revision, not a fresh spec to reverse-engineer.
- The handoff is **machine-first and budgeted**: one small entry file, one file per feature and per
  screen, shared facts stated once, JSON as the only source (no Markdown twins), and a token budget
  per file that `handoff` measures. See "Handoff format".

---

## Build order

| # | Step | Size | Depends on |
|---|------|------|------------|
| 0 | Tests, lint, CI, hooks (**done**) | Medium | — |
| 1 | Design-system profile + lookup (**done**) | Medium | 0 |
| 2 | Component tagging + linter (**done**) | Medium | 1 |
| 0b | Trim bloat before adding code | Medium | 2 |
| 3 | `spec.json` + schema | Large | 0b |
| 4 | Behaviours from `flow.json` | Small | 3 |
| 5 | Mapping file | Medium | 1, 3 |
| 6 | Handoff bundle | Medium | 3, 4, 5 |
| 6b | Revisions and change list | Medium | 6 |
| 7 | Developer instructions | Small | 6 |
| 8 | Rendered style audit | Medium | 1 |
| 9 | Screen templates | Medium | 2, R1 |
| R1 | Research: page-level compositions (project extensions) | Research | — |

R1 blocks only step 9 (R1 decides whether screen templates are compositions). Steps 3 and 6b gain
a composition node kind when R1 lands (an addition, with a `specVersion` bump); step 8 may need an
exception for composition styling. Order: 3 → 4 → 5 → 6 → 6b → 7 now; R1 before 8 and 9.
Docs are updated alongside each step.

---

## Done (steps 0, 1, 2)

- **Step 0 — checks.** Unit tests (`node:test`) and browser end-to-end tests (`POC_KIT_REQUIRE_CHROME=1`
  so CI can't pass without Chrome); ESLint; `check:docs` (CLI and docs agree), `check:pack`
  (runtime files are published), `check:version` (user-facing changes bump the version); CI on
  every PR plus a Node 18 load check; a Claude Code hook running lint, tests and the docs check
  after each edit.
- **Step 1 — design-system profile.** `add-ds` writes `vendor/ds-profile.json`: a draft from the CSS
  (`"reviewed": false`), or a shared reviewed profile via `--profile`, which also fetches the exact
  stylesheet it names and is refused if it names classes or tokens the CSS lacks. A component is
  described by markup (`{ element?, classes?, attributes? }`), as are its variants, states and
  parts, so class-based, BEM and classless design systems all fit. `poc-kit ds list | lookup |
  search | validate`. The neutral kit ships a reviewed profile. Drafts are close for Pico, usable
  with noise for Bootstrap and Carbon, and nearly empty for utility-first systems like Kumo (which
  `add-ds` now says).
- **Step 2 — tagging and the linter.** Tags: `data-screen`, `data-component` (+ `data-variant`,
  `data-state`, `data-part`), a stable `data-id`, `data-feature` (declared in a `poc-features`
  block), `data-mock`. `build` runs `lint-ds.mjs` on the source and fails on drift; reasoned
  exceptions go in `build.config.json` `"allow"`. The scaffold is tagged; a tagged sample dashboard
  lives in `cli/test/fixtures/sample/`. Limit: markup created by scripts at runtime isn't checked
  until step 3 walks the rendered page.
- **Fixed along the way:** a Chrome port race that let parallel `verify` runs drive each other's
  page; escaped Tailwind class names read short; local custom properties and token-only inline
  values wrongly rejected.
- **Known, not fixed:** the offline linter flags a citation URL in visible text (a `todo` test);
  `parseArgs` has no list of boolean flags, so `verify --quiet prototype.html` swallows the filename.

## Step 0b: Trim bloat before adding code

A review of everything built so far, measured on Bootstrap, Pico, Carbon, Kumo and the sample
(tokens = characters ÷ 4, an estimate).

| # | Bloat | Measured | Fix | Target |
|---|---|---|---|---|
| 1 | Lint output: one line per problem, same hint on every line | hkex_2 build ≈ 280 lines, ~11,000 tokens | Group by rule, counts summary, hint once, ≤ 10 examples per rule, `--all` for everything; unknown classes on one line | many-violation fixture ≤ 1,500 tokens |
| 2 | `verify` prints every passing step unless `$CI`; agents run without a terminal | sample 444 vs 74 tokens | Quiet when not a terminal, `--verbose` to force; no empty section headers | sample ≤ 100 tokens |
| 3 | `ds lookup` repeats variants as example lines and lists component internals | Bootstrap `Btn` ~1,030 tokens | One example line; tokens with `--tokens`. `ds list`: names only, `--detail` for markup and variants | `Btn` ≤ 300; Carbon list ≤ 600 |
| 4 | Draft profiles store every leftover class and token | Carbon draft ~64,500 tokens | Drafts say `"utilities": "all"`, `"tokens": "all"` (whatever the stylesheet defines); no per-component token lists in drafts | Carbon draft ≤ 20,000 |
| 5 | `vendor/ds-report.md` repeats the profile | 5,600–21,000 tokens | Drop it and `introspect-ds.mjs`; add `ds search <text>` for classes, tokens and components | — |
| 6 | Method steps in 4 places, tagging rules in 4; stale "grep the CSS" advice in `consistency.md`; step types repeated in `verification.md` | — | Claude skill points at METHOD instead of restating it; the Copilot prompt (its user may not have METHOD) stays self-contained but short; tagging rules live in METHOD §5 and the scaffold comment only; fix the stale references | skill + references ≥ ⅓ smaller |
| 7 | `rel()` in 5 modules, fetch helper in 2, test helpers in 4 files | — | `util.mjs` and `test/helpers.mjs` | — |
| 8 | `docs/PLAN.md` carries full detail of finished steps | 520 lines | Short "done" summaries | — |

Each measured target gets a test where it can.

**Status: done.** Measured after the fixes:

| # | Result | Test |
|---|---|---|
| 1 | ~350-problem fixture: ~520 tokens (identical messages also collapse into one line: 50 untagged buttons → 1 line) | `budgets.test.mjs` (≤ 1,500) |
| 2 | Sample `verify` without a terminal prints only the tally | `e2e/sample.test.mjs` (≤ 100) |
| 3 | Bootstrap `Btn` lookup ~220 tokens; Carbon `ds list` ~570 | `budgets.test.mjs` (20-variant lookup ≤ 300) |
| 4 | Drafts no longer grow with utility classes or tokens, and small objects sit on one line: Kumo ~9,900 → ~420 tokens, Bootstrap ~26,000 → ~5,700, Carbon ~64,500 → ~21,800 (**target 20,000 missed by ~9%**: what's left is 168 real component entries) | `budgets.test.mjs` |
| 5 | `ds-report.md` and `introspect-ds.mjs` removed; `ds search` added | `ds-cmd.test.mjs` |
| 6 | Skill rewritten as a pointer to METHOD (59 → 38 lines); `verification.md` 63 → 30; stale advice in `consistency.md` replaced; tagging rules now in METHOD §5 and the scaffold comment only; METHOD §4–5 shorter | `check:docs` |
| 7 | `rel`, `fetchUrl`, `toJson` in `util.mjs`; `test/helpers.mjs` | — |
| 8 | Finished steps summarised under "Done" | — |

Also: all output now goes to stdout in order (failures had been going to stderr and could print
above their own header when an agent read `2>&1`).

## Testing rule for every later step

Each step ships with its tests in the same PR:
- **Linter rules:** small good and bad HTML examples in `cli/test/fixtures/`. Each rule has at least
  one example that must pass and one that must fail.
- **Schemas** (profile, spec, mapping): valid and invalid example files, checked with Ajv.
- **`spec.json`:** a golden-file test. Build a sample prototype and compare the output with a saved
  `spec.json`.
- **Mapping:** a version mismatch and an unmapped component each give the right message.
- **One shared sample prototype** in `cli/test/fixtures/sample/`, tagged correctly. The end-to-end
  test and dogfooding both use it. Created in step 2.
- **Handoff size:** the sample's handoff is checked against the token budgets in a test, so a
  change that bloats the output fails CI.
- **Docs:** new commands go in `cli/README.md`, and in `METHOD.md` + both adapters if they're part
  of the workflow. `check:docs` enforces it.

## Handoff format: written for machines

A developer's agent should load **only what the task in front of it needs**: the same "look it up
when you need it" idea as `poc-kit ds lookup`, applied to the handoff. The format rules below apply
to steps 3–7.

**Layout**

```
handoff/
  index.json          entry point, small: what this is, read order, one line per slice
  components.json     each design-system component used, stated once: docs link, variants and
                      states used, designed/not-designed states, mapped target component per target
  tokens.json         only the tokens used (W3C DTCG)
  features/<id>.json  one per feature: its nodes, transitions, behaviours, data, mocked logic
  screens/<id>.json   one per screen: its layout tree, and nodes that belong to no feature
  changes.json        (revisions after the first) what changed, as ids, pointing at slices
  AGENTS.md           short instructions for the developer's agent (step 7)
  HANDOFF.md          one page for people: what it is, how to run it, real vs mocked, open questions
  assets/             screenshots and prototype.html: listed in index.json, not meant to be read
```

**Rules**

1. **One entry point.** `index.json` names the revision, the design system, the read order, and
   each slice with its title, file and size in tokens. An agent reads it first and then loads only
   the slices it needs.
2. **Split by unit of work.** A feature slice holds everything needed to build that feature, so an
   agent implementing `export-csv` reads one file plus the shared tables, not the whole spec.
3. **State shared facts once.** Nodes name their component and variant; docs links, state
   coverage and mappings live once in `components.json`. Tokens are referenced by name.
4. **JSON is the only source.** No Markdown copies of the same content (`behaviours.md`,
   `changes.md`, `logic.md` are dropped). People run `poc-kit handoff show <feature | screen |
   node | changes>` to read any part as text. `HANDOFF.md` is capped at one page and does not
   restate the spec.
5. **Compact by default.** Omit empty fields, defaults and nulls. Keys stay readable words (short
   cryptic keys save little and cost comprehension). Output is sorted and stable, so revisions diff
   cleanly. Whether pretty-printed or one-object-per-line JSON is cheaper is decided by measuring
   both on the sample and on hkex_2.
6. **Nothing an agent shouldn't read is in its path.** `prototype.html` and screenshots sit in
   `assets/`, listed in `index.json` as visual references only. No schema files are copied in:
   each file carries `specVersion` and a `$schema` URL.
7. **Changes first.** For a revision, `changes.json` lists added, removed and changed ids and the
   slices they're in. An agent reads it, then loads only the touched slices. Removed items keep a
   short description, since their slice no longer exists.
8. **Measured.** `poc-kit handoff` estimates tokens per file (characters ÷ 4, labelled as an
   estimate), prints the table, and warns over budget (fails with `--strict`). Starting budgets, to
   be calibrated on the sample and hkex_2: `index.json` ≤ 1,500; each slice ≤ 4,000;
   `components.json` ≤ 3,000; `AGENTS.md` ≤ 800. A slice over budget is a sign the feature should
   be split.
9. **Readable without poc-kit.** Developers may not have poc-kit; the files alone are enough.
   `handoff show` is a convenience.

## Step 3: `spec.json` and its schema

Tasks:
1. Write `cli/schema/spec.schema.json`, starting at `specVersion: "0.1"`:
   - `meta`: requirement source, build date, poc-kit version
   - `designSystem`: `name`, `version`, `package`, `docs`, `profile` (which profile was used)
   - `tokens`: reference to `tokens.json` (W3C DTCG format)
   - `screens[]`: `id`, `title`, `purpose`, `template`, `root`, `screenshot`
   - `nodes{}`: `id`, `component`, `componentDocs` (link from the profile), `variant`, `props`,
     `states` (each `designed` or `not-designed`), `children`, `data` (`real` / `mock` /
     `unknown`, with a reason for mock)
   - `features[]`: `id`, `title`, `source`, and the screens and nodes that belong to it
   - `transitions[]`: `from`, `trigger` (node ID + event), `to`, `condition`
   - `data`: shapes and types of the mock data
   - `gaps`: unmapped components, assumptions, open questions, linter exceptions
2. New `cli/src/spec.mjs`. It loads the built prototype in headless Chrome, walks each screen
   (using `flow.json` to reach screens that JS builds), and builds the tree from the `data-*` tags.
3. Without Chrome, fall back to parsing the source HTML statically and set `"partial": true`.
4. Validate against the schema before writing. An invalid spec is a failure.
5. Export the tokens actually used to `handoff/tokens.json` in DTCG format.

Spec rules:
- Say what, not how. No HTML tags, CSS classes or framework terms.
- Token names, never raw values.
- Stable IDs on everything.
- Flat `nodes{}` referenced by ID, not deep nesting.
- Missing states show as `not-designed`, not silently absent — once per component in
  `components.json`, not per node.
- The spec is the model behind the handoff files. It is **written out split**, per "Handoff
  format": `index.json`, `components.json`, `features/*.json`, `screens/*.json`. There is no single
  `spec.json` in the handoff; `poc-kit` can print the whole model with `handoff show --all` for
  debugging.

Done when: the split files validate, every tagged element and every screen transition appears in
exactly one slice, and the sample handoff is within the token budgets.

## Step 4: Behaviours from `flow.json`

Tasks:
1. Add optional `given` / `when` / `then` text to steps in `cli/schema/flow.schema.json`.
2. New `cli/src/behaviours.mjs` that turns the flow into Given/When/Then entries referring to node
   IDs. Each behaviour goes into the slice of the feature (or screen) it exercises; there is no
   separate behaviours file. `handoff show behaviours` lists them all for people.
3. Optional, web only: `--playwright` also writes a Playwright test file. Not part of the core
   handoff.

Done when: every flow step appears as a Given/When/Then entry tied to a node ID, in exactly one
slice.

## Step 5: Mapping file

A **mapping file** links one design system to one target stack. It is maintained in a shared place
(e.g. a team repo), versioned, and used by both sides:
- poc-kit uses it **while building the prototype**, so gaps show up before the handoff.
- Developers use it **while implementing**, and update it when they find a gap.

`mapping.<target>.json` contains:
- `source`: design-system name + version (must match the profile)
- `target`: stack name + kit name + version (e.g. `ios` / `AcmeKit` / `3.2`)
- `components[]`, where each entry has:
  - `source` (design-system component name)
  - `target` (target component name, or `null`)
  - `status`: `exact` / `partial` / `none`
  - `variants` (source variant → target variant)
  - `props` (source prop → target prop)
  - `notes`

Tasks:
1. Write `cli/schema/mapping.schema.json`.
2. `build.config.json` gets an optional `mappings: ["path-or-url", …]`, one per target stack.
3. `lint-ds.mjs` reports, per target: components used that are `none`, missing from the mapping,
   or `partial`. Default is warn. A config flag can make it block.
4. The mapped component and status per target go into `components.json`, once per component —
   not on every node, and not as a copy of the whole mapping file.
5. New `poc-kit mapping init --target <name>` that writes a starter mapping with every profile
   component listed and `status: "none"`.
6. Check that `source` matches the profile's name and version. A version mismatch is a warning.

Done when: a prototype using a component with no mapping shows that gap at build time, and the
handoff lists the mapped target component for every node.

## Step 6: Handoff bundle

Tasks:
1. `init` scaffolds two marked blocks so mock data and logic can be extracted:
   - `<script type="application/json" id="poc-mock-data">`
   - a `// @poc-logic` section for mocked calculations
   The linter checks they exist.
2. Rewrite `cli/src/handoff.mjs`: `poc-kit handoff` runs build, verify, spec and behaviours, then
   writes the layout in "Handoff format". Mock data and mocked logic go into the feature slice
   that uses them: data as shapes plus one small sample, logic as inputs, outputs and a one-line
   description, marked as fake.
3. `poc-kit handoff show <feature | screen | node | changes | behaviours> [--md]` renders any part
   for people.
4. Token table and budget check, per rule 8.
5. `HANDOFF.md` is generated: design system and version, how to run, real vs mocked (counts and
   the feature list), open questions and allowed exceptions. One page.

Done when: one command produces a folder a developer's agent could build from without opening
the HTML, and the sample's handoff is within budget.

## Step 6b: Revisions and change list

A prototype is one project that changes over time. Each handoff is a numbered revision, and every
handoff says what changed since an earlier one.

Tasks:
1. `METHOD.md`: for incremental work, keep the same prototype project in git and change it. Don't
   start fresh with `init`: that throws away the stable IDs the change list depends on.
2. `poc-kit handoff` writes `handoffs/r<N>/` (a full bundle, as in step 6) and
   `handoffs/r<N>/revision.json`: revision number, date, the revision it follows, the requirement
   source. `handoffs/latest` points at the newest. Earlier revisions are kept.
3. The change list, `changes.json`, is written against the previous revision by
   default, or any earlier one with `--since r<N>` (a developer may jump from r1 to r3). It lists:
   - features added, removed, changed (and which screens and nodes that touched)
   - screens and nodes added, removed, changed (component, variant, props, states)
   - behaviours added and removed, so developers add or delete the matching tests
   - changes to mock data shapes and tokens
4. `poc-kit diff <revision | folder> <revision | folder>` prints the same comparison without
   writing a handoff.
5. `changes.json` holds ids and the slices they're in, not the content again; an agent follows the
   pointers. `handoff show changes` renders it for people.
6. Only the latest revision is in an agent's path (`handoffs/latest`). Earlier revisions exist for
   `--since`, not for reading.
7. Guard against ID churn: when a revision removes and adds many nodes of the same component, IDs
   were probably renamed rather than the UI changed. `handoff` warns and names them instead of
   producing a misleading change list.

Done when: features 1–10 → 1–11 → 2–11 produce r2 "added feature 11" and r3 "removed feature 1"
with the nodes and behaviours each touched, and `--since r1` from r3 shows both.

## Step 7: Developer instructions

Write `cli/templates/AGENTS.md` (the name coding agents already look for; within the 800-token
budget), a short procedure rather than prose:
1. Read `index.json`. If `changes.json` exists, read it and work only on what it lists.
2. For each task, load only its slice (`features/<id>.json` or `screens/<id>.json`).
3. Look components up in `components.json`; use the mapped target component. No mapping → pick
   the closest in your kit, record it as a gap, propose an update to the shared mapping file.
   Never invent a component silently.
4. Use `tokens.json` for values. Treat everything marked `mock` as needing real data.
5. Implement the slice's behaviours as tests.
6. Don't read `assets/`. Look at a screenshot only to check a visual detail.
7. A removed feature means deleting its code and tests, not hiding it.

## Step 8: Rendered style audit

Tasks:
1. In `cli/src/verify.mjs`, after the flow runs, collect every distinct computed colour, font size,
   font family, radius and spacing value on the page.
2. Fail if a value does not come from a design-system token. Keep a small allow-list (`0`,
   `transparent`, …).
3. Write `out/style-audit.json`.

Done when: a custom `color: #123456` in the prototype's own CSS fails `verify`.

## Step 9: Screen templates

Tasks:
1. Add structural templates to `cli/templates/flows/`: list → detail, form → confirm, multi-step
   wizard, dashboard. Structure only, using `.pk-*` primitives and slots for tagged components.
2. `poc-kit init --template <name>`, usable per screen.
3. Record each screen's template in the spec. Deviations go into `gaps`.

Done when: two separate runs of the same prompt produce the same screen structure.

## Field test: hkex_2 (Kumo), what it showed

Tried steps 1–2 on a real prototype built with `@cloudflare/kumo` 2.13.2 before tagging it:

| Rule | Count | Reading |
|---|---|---|
| `unknown-class` | 151 | A hand-made design system inside the prototype: its own `.btn`/`.btn--primary`, text scale (`.muted`, `.xsmall`, `.eyebrow`), layout (`.shell`, `.row`, `.gap`) and page sections (`.brief-hero`, `.band`) |
| `inline-style` | 56 | Off-scale values: `margin-top: 26px`, `padding: 9px 14px`, `font-size: 1.375rem` |
| `raw-color` | 14 | Hard-coded colours |
| `untagged-widget` / `screen-untagged` | 54 / 7 | Not tagged yet — expected |

Lessons:
- **Utility-first design systems** (Tailwind-based, components shipped as React) keep components in
  code, not CSS: 1,101 of Kumo's 1,114 classes are utilities, so a draft profile finds almost no
  components. `add-ds` now says so. Decision: no Kumo profile for now.
- **Prebuilt utility CSS only contains the utilities the library itself uses.** An agent wanting
  `mt-6` finds no such class and falls back to inline styles or invented classes — likely a cause
  of this prototype's drift.
- Fixed from this test: escaped class names (`h-\[1\.25em\]`) were cut short and broke the draft;
  local custom properties (`--d: 40%`) and token-only inline values (`color: var(--kumo-danger)`)
  were wrongly rejected.
- Open: allow `1px`/`0` in border and outline properties when the colour is a token
  (`border-bottom: 1px solid var(--color-kumo-hairline)` currently fails).
- The biggest remaining gap is page-specific compositions (`.brief-hero`, the app shell): real,
  needed, and not in any design system. See R1.

## R1 (research): page-level compositions — "project extensions"

**The problem.** Prototypes need things the design system doesn't have: an app shell, a brief hero,
an opportunity grid. Today the only options are to invent classes (the linter fails them) or add
`allow` entries (meant for rare exceptions). Naming them as components is the wrong model: they
aren't atoms like a Button. They *contain* many design-system components and offer their own
affordances (a hero with a call to action, a shell with navigation and search).

**Research before designing anything.** Questions to answer:

1. **Taxonomy.** What tier is this? Candidates from existing practice: Atomic Design (organism /
   template), "patterns" vs "components" (GOV.UK Design System, Carbon), canonical layouts
   (Material), templates and flows (Stripe's Sail, per the talk that started this plan), core vs
   product-level vs local components (Nathan Curtis's design-system tiers). Pick one vocabulary.
2. **What a declaration says.** Probably: name, purpose, its regions/slots, which design-system
   components each region may hold, the affordances it offers (actions, states, interactions),
   the data it shows, responsive behaviour, and its landmark/role for accessibility. Which of these
   earn their place, and which are guesses an agent would fill with noise?
3. **Its own styling.** Should a composition be allowed any CSS of its own, or only layout
   (`.pk-*`) and design-system components inside it? Where does "a composition" end and "a new
   component the design system is missing" begin — and should the handoff say which it is?
4. **How it's checked.** The linter would check that a composition is declared, its regions hold
   only allowed children, and nothing inside is invented.
5. **How it's handed off.** Developers build it from their own kit's components. The spec needs a
   node kind for it (regions containing component nodes), and the handoff marks it "custom — not in
   <design system>". How does this map onto the mapping file (step 5)?
6. **Lifecycle.** Scope: one prototype, or shared across prototypes of the same product (a layer
   between the design-system profile and the project)? How does a composition get promoted into
   the design system (contribution models)? How do duplicates get noticed?
7. **Relation to features and templates.** A composition often *is* a feature's UI (step 6b), and
   step 9's screen templates are compositions of screens. One concept or three?

**Output of R1:** a short decision note (vocabulary, declaration format, what the linter and
handoff do with it), then an implementation step inserted into the build order.

**Effect on other steps.** Step 3 can go ahead with component nodes only. When R1 lands, the spec
gains a composition node kind with a `specVersion` bump — that is what the version field is for.
Until then, prototypes use `allow` entries for page-specific classes, with reasons.

## Docs updates (alongside each step)

- `METHOD.md`: §4 (profile + lookup), §5 (tagging, templates), §7 (linter enforces reuse),
  §8 (style audit), §9 (new handoff), and the durable principles.
- `claude/skills/interactive-poc/SKILL.md`, `cli/templates/copilot/*`, `cli/README.md`.

---

## Risks

- **Profiles need a human check once per design system.** The draft from CSS will be rough. After
  review it is reused, so the cost is paid once, not per project.
- **A mapping file only helps if someone owns it.** Put it in a shared repo with an owner, and ask
  developers to update it when they find a gap.
- **Mappings go stale when either kit changes.** Both versions are recorded, and a mismatch warns.
- **A strict linter slows the first builds.** That is the price of consistency. `--allow` keeps it
  from blocking progress, and every exception is visible in the handoff.
- **The spec is only as good as the tags.** The linter must be strict about untagged widgets.
- **Schema changes break older handoffs.** Every schema is versioned from the start.

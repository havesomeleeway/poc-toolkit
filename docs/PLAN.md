# Plan: consistent prototypes and a stack-neutral handoff

Status: agreed, not started. Branch: `claude/eager-goldberg-zeld2b`.

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

---

## Build order

| # | Step | Size | Depends on |
|---|------|------|------------|
| 0 | Tests, lint, CI, hooks (**done**) | Medium | — |
| 1 | Design-system profile + lookup | Medium | 0 |
| 2 | Component tagging + linter | Medium | 1 |
| 3 | `spec.json` + schema | Large | 2 |
| 4 | Behaviours from `flow.json` | Small | 3 |
| 5 | Mapping file | Medium | 1, 3 |
| 6 | Handoff bundle | Medium | 3, 4, 5 |
| 7 | Developer instructions | Small | 6 |
| 8 | Rendered style audit | Medium | 1 |
| 9 | Screen templates | Medium | 2 |
| — | Docs updates | Small | alongside each step |

**First milestone:** steps 1 to 3. That fixes most of the drift and gives developers a real spec.

---

## Step 0: Tests, lint, CI and hooks (done)

Before this step the only automated check was `node --check` (does each file parse), and it only
ran at publish time.

What now exists:
- **Unit tests** (`cli/test/unit/`, `node:test`): offline linter, design-system introspection, arg
  parsing, config loading, flow schema, and every command run as a real process (no Chrome).
- **End-to-end test** (`cli/test/e2e/`): `init → add-ds --none → build → verify` in a real browser.
  `POC_KIT_REQUIRE_CHROME=1` makes a `DEGRADED` run fail, so CI can't pass without the browser.
- **ESLint** (dev dependency only).
- **`check:docs`**: the CLI and the docs agree (it caught `poc-kit query` missing from the README).
- **`check:pack`**: every runtime file is in the npm package.
- **`check:version`**: a PR that changes what users get must bump the version.
- **CI on every PR** (`.github/workflows/ci.yml`), plus a Node 18 load check.
- **Claude Code hook** (`.claude/settings.json`): lint, unit tests and docs check after each edit.

Known issues found while writing tests, not fixed yet:
- The offline linter flags a citation URL in visible text (recorded as a `todo` test).
- `parseArgs` has no list of boolean flags, so `verify --quiet prototype.html` reads the filename
  as the value of `--quiet`.

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
- **Docs:** new commands go in `cli/README.md`, and in `METHOD.md` + both adapters if they're part
  of the workflow. `check:docs` enforces it.

## Step 1: Design-system profile and lookup

A **design-system profile** is one JSON file per design system that says what the design system
contains. It is written once, checked by a human, and reused by every project that uses that
design system. It replaces guessing components from CSS on every run.

`ds-profile.json` contains:
- `name`, `version`, `package` (npm name or stylesheet URL), `docs` (base docs URL)
- `components[]`, where each component has:
  - `name` (the design system's own name, e.g. `Tag`)
  - `docs` (a link to that component's docs page)
  - `classes` (root class and part classes)
  - `variants`, `states`, `tokens` used
  - `snippet` (a correct example of the markup)
- `tokens` (the design system's custom properties, grouped)

Tasks:
1. Write `cli/schema/ds-profile.schema.json`.
2. Change `cli/src/introspect-ds.mjs` to also write a **draft** `vendor/ds-profile.json`, grouping
   classes into likely components. Mark it `"reviewed": false`.
3. Change `add-ds` to accept `--profile <path | url>`, so it uses an existing reviewed profile
   instead of the draft. Store the chosen profile in `build.config.json`.
4. Warn loudly in `build` when the profile is still `"reviewed": false`.
5. New `poc-kit ds lookup <Component> [--json]` (`cli/src/dsLookup.mjs`) that prints one
   component's entry.
6. New `poc-kit ds list` that prints component names only.
7. Register both in `cli/bin/poc-kit.mjs`.

Done when: `poc-kit ds lookup Button --json` returns a useful entry for a real design system and
for the neutral kit, and `add-ds --profile` reuses a shared profile.

## Step 2: Component tagging and the linter

The prototype records what each element is, using design-system names from the profile.

Tag convention:
- `data-screen="checkout"` on each screen
- `data-component="Button"`, `data-variant="primary"`, `data-state="disabled"` on components
- `data-id="checkout.pay"`, a stable node ID, unique across the prototype
- `data-mock="true"` on mocked values

Tasks:
1. Update `cli/templates/prototype.src.html` to use the tags.
2. New `cli/src/lint-ds.mjs`, run by `build.mjs` after the offline lint. It fails when:
   - a class is not in the profile or `layout.css`
   - `data-component` / `data-variant` names something not in the profile
   - a widget-like element (button, input, select, link styled as a button, …) has no tag
   - an inline `style=` sets colour, font or spacing
   - a raw hex or rgb colour does not match a token
   - two elements share a `data-id`
3. `--allow <rule>:<id>` lets a specific failure pass. Every allowed exception is written into the
   handoff under `gaps`.

Done when: an invented class, an untagged button or a hard-coded colour fails `poc-kit build` with
a clear message.

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
- Missing states show as `not-designed`, not silently absent.
- Keep it small. Split per screen if it grows.

Done when: `spec.json` validates, and every tagged element and every screen transition is in it.

## Step 4: Behaviours from `flow.json`

Tasks:
1. Add optional `given` / `when` / `then` text to steps in `cli/schema/flow.schema.json`.
2. New `cli/src/behaviours.mjs` that writes `handoff/behaviours.md` (numbered Given/When/Then lines)
   and `handoff/behaviours.json`, both referring to node IDs.
3. Optional, web only: `--playwright` also writes a Playwright test file. Not part of the core
   handoff.

Done when: every flow step appears as a readable Given/When/Then line tied to a node ID.

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
4. `spec.mjs` adds, per node and per target, the mapped component and status.
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
   writes:

```
handoff/
  spec.json
  spec.schema.json
  tokens.json
  mapping.<target>.json   (copies of the mappings used, if any)
  behaviours.md / behaviours.json
  mock-data.json
  logic.md                (each mocked calculation: inputs, outputs, marked as fake)
  screens/*.png           (per screen and key state, named by node ID)
  prototype.html          (visual reference only)
  HANDOFF.md              (design system used, real vs mocked, how to run, gaps, open questions)
  IMPLEMENTING.md         (instructions for the developer's agent)
```

3. `HANDOFF.md` starts with a short summary: design system name, version and docs link; list of
   components used, each with its docs link; mapping status per target.

Done when: one command produces a folder a developer could build from without opening the HTML.

## Step 7: Developer instructions

Write `cli/templates/IMPLEMENTING.md`, a short prompt for any coding agent:
- Build from `spec.json`. Use `prototype.html` only to compare visually.
- For each component, use the mapping file. If there is no mapping, choose the closest component in
  your kit, list it under "gaps", and propose an update to the shared mapping file. Do not invent
  new components silently.
- Use `tokens.json` for values.
- Treat everything marked `mock` as needing real data.
- Check your build against `behaviours.md`.

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

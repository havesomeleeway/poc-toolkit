# Contributing

**`METHOD.md` is the source of truth.** It defines the methodology. `claude/skills/interactive-poc/SKILL.md`
and `cli/templates/copilot/interactive-poc.prompt.md` are thin adapters that mirror it — when you
change the method, update all three in the same commit and keep them consistent.

The deterministic work lives in `cli/` (`poc-kit`). Keep its only runtime dependency
(`chrome-remote-interface`) — add nothing else without a strong reason. Every `src/*.mjs` module
should `node --check` clean and stay small.

Before opening a PR:

```
cd cli && npm install
npm run ci          # syntax, lint, unit tests, docs sync, package contents
npm run test:e2e    # init -> add-ds -> build -> verify in a real browser (needs Chrome; set CHROME_PATH)
```

CI (`.github/workflows/ci.yml`) runs the same on every PR, plus:

- **Version bump.** A PR that changes what npm users get (`bin/`, `src/`, `templates/`, `schema/`,
  `cli/README.md`, or runtime fields in `package.json`) must bump `cli/package.json`'s version:
  `npm version patch --no-git-tag-version`. Tests, scripts and dev dependencies don't need a bump.
- **Node 18.** The CLI promises `node >= 18`; every module must still load there.

`npm run check:docs` fails when the docs and the CLI disagree: a command missing from
`cli/README.md`, a `poc-kit <x>` in any doc that isn't a real command, or `METHOD.md`, the Claude
skill and the Copilot prompt naming different commands or a different number of steps.

When you add code, add tests with it: unit tests in `cli/test/unit/` (`node:test`, no extra
runner), and extend `cli/test/e2e/` when the change affects the build-and-verify path. Only
`chrome-remote-interface` ships to users; dev dependencies (ESLint, Ajv) are fine.

In Claude Code, `.claude/settings.json` runs lint, unit tests and the docs check after each edit
under `cli/` or to the method docs, and hands failures back to the agent.

## Releasing the CLI to npm

A `git push` updates the Claude plugin and Copilot prompt (they're pulled from GitHub), **but not
the npm package** — `poc-kit` on npm is frozen at whatever version was last published. Any change
under `cli/` that users should get needs a new version published.

**Automatic:** when `cli/**` changes land on `main`, `.github/workflows/publish-cli.yml` compares
`cli/package.json`'s version with npm. If it's newer, it tests and publishes and tags
`poc-kit-vX.Y.Z`. If `cli/` changed but the version wasn't bumped, the run posts a warning.
One-time setup: add a repo secret **`NPM_TOKEN`** (npm → Access Tokens → *Automation*).

**Manual** (no CI / no token): from `cli/`, with a clean working tree —

```
npm run release      # npm version patch -> commit + tag -> git push --follow-tags -> npm publish
```

Bump `minor`/`major` by hand (`npm version minor`) when the change warrants it.

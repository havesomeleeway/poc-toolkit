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
node --check bin/poc-kit.mjs && for f in src/*.mjs; do node --check "$f"; done
# dogfood in a scratch dir: poc-kit init . && add-ds <something> && build && verify
```

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

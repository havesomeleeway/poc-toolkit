# Contributing

**`METHOD.md` is the source of truth.** It defines the methodology. `claude/skills/interactive-poc/SKILL.md`
and `copilot/prompts/interactive-poc.prompt.md` are thin adapters that mirror it — when you change
the method, update all three in the same commit and keep them consistent.

The deterministic work lives in `cli/` (`poc-kit`). Keep its only runtime dependency
(`chrome-remote-interface`) — add nothing else without a strong reason. Every `src/*.mjs` module
should `node --check` clean and stay small.

Before opening a PR:

```
cd cli && npm install
node --check bin/poc-kit.mjs && for f in src/*.mjs; do node --check "$f"; done
# dogfood in a scratch dir: poc-kit init . && add-ds <something> && build && verify
```

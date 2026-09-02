# poc-toolkit

Turn a requirement into **one self-contained, offline, clickable HTML prototype** — styled with the
**real** target design system, driven by **mocked** logic, and **verified by driving it** in a
headless browser.

It is **design-system- and use-case-agnostic**. It supplies process, scaffolding and checks. It
does **not** decide the prototype's screens, interactions, mocked logic, or whether there's an
export path — those come from the requirement and your direction for each build.

## Parts

| Path | What | For |
|---|---|---|
| [`METHOD.md`](./METHOD.md) | The canonical 9-step method (source of truth) | everyone |
| [`cli/`](./cli) | **`poc-kit`** — Node CLI: `init` · `add-ds` · `add-font` · `build` · `verify` · `handoff` | everyone (humans, Copilot, Claude Code) |
| [`claude/`](./claude) | Claude Code **skill + plugin** (`/interactive-poc`) — thin, follows `METHOD.md`, calls `poc-kit` | Claude Code users |
| [`copilot/`](./copilot) | Copilot **prompt file** + `copilot-instructions` snippet — same method, same CLI | GitHub Copilot users |

Both assistant adapters are thin and mirror `METHOD.md`. Edit the method there, not in the
adapters.

Worked examples are kept **out of this repo** (`.gitignore`d) — a finished build can carry
client-derived material. Start every new build from `poc-kit init`.

## License

MIT — take it, adopt it, adapt it.

## Quick start (CLI)

```bash
cd cli && npm install           # one dependency: chrome-remote-interface
npm link                        # or: npx --prefix ./cli poc-kit …

# in a working directory for the build:
poc-kit init .
poc-kit add-ds @picocss/pico          # or an npm name / CSS URL / --none
poc-kit add-font "Inter"              # optional; embeds the font offline
#   ... build the screens the requirement needs in prototype.src.html ...
poc-kit build                         # inline vendor/* -> prototype.html, lint offline
poc-kit verify                        # static checks + headless-browser drive (if Chrome present)
poc-kit handoff                       # HANDOFF.md skeleton
```

`poc-kit verify` needs a Chrome/Chromium binary for the interaction flow (set `CHROME_PATH` or
install one). Without it, it runs the static checks and prints `DEGRADED`.

## Install the Claude Code plugin

Point your Claude Code plugin config at `claude/` in this repo (it contains
`.claude-plugin/plugin.json`, the `interactive-poc` skill, and the `/interactive-poc` command).
Ensure `poc-kit` is on `PATH` (`cd cli && npm link`).

## Wire up Copilot

Copy `copilot/prompts/interactive-poc.prompt.md` to `.github/prompts/` in the consuming repo, and
paste `copilot/copilot-instructions.snippet.md` into that repo's `.github/copilot-instructions.md`.
Ensure `poc-kit` is installed (`npm i -g` from `cli/`, or committed as a dev dependency).

## What you provide per build

- **Required:** the requirement source; the purpose, audience and scope/time budget.
- **Recommended:** the design system (npm / URL / `--none`); which slice to build.
- **Optional:** persona hints, brand assets (font, colour, wordmark), sample data, any specific
  behaviour the prototype must show, prior artefacts to match.

## What you get

`prototype.html` (single, offline) · `prototype.src.html` + `vendor/` + `build.config.json`
(rebuildable) · `flow.json` (re-runnable check) · `out/` (screenshots + report) · `HANDOFF.md`.

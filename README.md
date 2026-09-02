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
| [`cli/`](./cli) | **`poc-kit`** — Node CLI: `init` · `add-ds` · `add-font` · `build` · `verify` · `handoff` · `copilot-init` | everyone (humans, Copilot, Claude Code) |
| [`claude/`](./claude) | Claude Code **skill + plugin** (`/interactive-poc`) — thin, follows `METHOD.md`, calls `poc-kit` | Claude Code users |
| [`copilot/`](./copilot) | How to wire up Copilot — `poc-kit copilot-init`, or the files under `cli/templates/copilot/` | GitHub Copilot users |

Both assistant adapters are thin and mirror `METHOD.md`. Edit the method there, not in the
adapters.

Worked examples are kept **out of this repo** (`.gitignore`d) — a finished build can carry
client-derived material. Start every new build from `poc-kit init`.

## License

MIT — take it, adopt it, adapt it.

## Quick start (CLI)

```bash
npm install -g poc-kit

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

## Use it from Claude Code

```bash
npm install -g poc-kit
bash claude/install-skill.sh     # copies the skill + /interactive-poc into ~/.claude
```

Then open a **new** Claude Code session anywhere and run `/interactive-poc` (or just ask for "an
interactive POC of `<doc>`" — the skill self-triggers).

`install-skill.sh` installs into `~/.claude/skills/` and `~/.claude/commands/`; set
`CLAUDE_SKILLS_DIR` / `CLAUDE_COMMANDS_DIR` to override. Re-run it to update after a `git pull`.

*(Team distribution: package `claude/` as a plugin — it has `.claude-plugin/plugin.json` — and
install it from this repo instead.)*

## Wire up Copilot

From the repo where you want `/interactive-poc`, with `poc-kit` installed:

```bash
poc-kit copilot-init
```

That writes `.github/prompts/interactive-poc.prompt.md` and creates/updates
`.github/copilot-instructions.md`. In Copilot Chat (**Agent** mode) type `/interactive-poc`.

For peers who don't use a terminal, see **[poc-toolkit-starter](https://github.com/havesomeleeway/poc-toolkit-starter)**
— a one-click GitHub template with everything pre-wired for Codespaces.

## What you provide per build

- **Required:** the requirement source; the purpose, audience and scope/time budget.
- **Recommended:** the design system (npm / URL / `--none`); which slice to build.
- **Optional:** persona hints, brand assets (font, colour, wordmark), sample data, any specific
  behaviour the prototype must show, prior artefacts to match.

## What you get

`prototype.html` (single, offline) · `prototype.src.html` + `vendor/` + `build.config.json`
(rebuildable) · `flow.json` (re-runnable check) · `out/` (screenshots + report) · `HANDOFF.md`.

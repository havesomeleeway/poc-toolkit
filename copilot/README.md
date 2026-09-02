# Copilot adapter

The two files Copilot needs — a prompt file and an instructions snippet — are the canonical
copies under **[`../cli/templates/copilot/`](../cli/templates/copilot/)** (so the published
`poc-kit` package carries them).

## Add them to a repo

**Easiest** — from the repo root, with `poc-kit` installed:

```bash
poc-kit copilot-init
```

writes `.github/prompts/interactive-poc.prompt.md` and creates/updates
`.github/copilot-instructions.md`.

**By hand** — copy `cli/templates/copilot/interactive-poc.prompt.md` to `.github/prompts/`, and
paste the body of `cli/templates/copilot/copilot-instructions.snippet.md` into
`.github/copilot-instructions.md`.

## Use it

In Copilot Chat, **Agent** mode: `/interactive-poc`, then give it the requirement, the design
system, and the audience/time budget.

The prompt file mirrors `../METHOD.md` — keep the two in sync (see `../CONTRIBUTING.md`).

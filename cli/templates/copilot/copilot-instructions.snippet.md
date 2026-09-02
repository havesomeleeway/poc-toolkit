<!--
Paste this block into the consuming repo's .github/copilot-instructions.md
(create the file if it doesn't exist). It points Copilot at the same method and CLI
the Claude Code skill uses.
-->

## Building interactive POCs / demo prototypes

When asked for an interactive demo, POC, pitch prototype, or clickable mockup from a requirement
(doc / ticket / PRD / user story):

- Follow the team method: one self-contained **offline** HTML file, **one slice** of the
  requirement, styled with the **real** target design system, logic **mocked** (deterministic,
  labelled illustrative, never fake precision), **verified by driving it** in a headless browser.
- Use the **`poc-kit`** CLI for the deterministic work:
  `npx poc-kit init` · `add-ds <npm|url|--none>` · `add-font` · `build` · `verify` · `handoff`.
- Presume **no features**. Screens, interactions and any export path come from the requirement and
  the user's direction only.
- **Confirm the slice + screen list** with the user before building. The **actor/persona is the
  user's call** — give a reasoned recommendation, then let them choose.
- A build is done only when `poc-kit verify` prints `PASS` (zero console errors) and `HANDOFF.md`
  is filled in.

Full method: <https://github.com/havesomeleeway/poc-toolkit/blob/main/METHOD.md>.
Reusable prompt: `.github/prompts/interactive-poc.prompt.md`.

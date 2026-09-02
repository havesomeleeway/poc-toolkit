# Consistency checklist

Expanded from `METHOD.md` §7.

**This is a list of decisions to make once and apply the same way on every screen. It is NOT a
list of correct answers.** The chosen design system's own guidance decides each one; where the
design system is silent and the use case has no opinion, pick something sensible and record it in
`HANDOFF.md`.

## Decide once, then keep consistent

- **Primary action placement** — where the main forward action sits in a footer/toolbar, and
  which action is "primary" on each screen. Follow the design system's form/wizard pattern.
- **Secondary / back actions** — their placement relative to the primary, and their visual weight.
- **Status & state** — how "success / warning / error / empty / loading" are shown. If the design
  system's convention relies on colour, check it still reads without colour.
- **Navigation model** — linear wizard, hub-and-spoke, tabs — pick one and don't mix.
- **Keyboard & focus** — every control reachable and operable by keyboard; a visible focus style
  exists (the neutral kit and most design systems provide one).
- **Provenance** — whether the prototype surfaces where the requirement/data came from (e.g. a
  collapsible "source" panel). Optional; decide yes/no once.
- **"Illustrative" labelling** — one consistent way of marking mocked numbers/data as not real.
- **Empty and error states** — at least acknowledge them; don't only build the happy path if the
  requirement implies others.
- **Structural composition** — which `.pk-*` primitive (`vendor/layout.css`) covers which
  recurring structural role (e.g. "form rows use `.pk-switcher`", "the actions row uses
  `.pk-cluster`") — pick once, use the same one everywhere that role recurs.

## Not in scope for a POC

Bespoke components, animation systems, bespoke responsive breakpoint systems beyond what the
layout primitives already handle fluidly, theming. If the requirement seems to need these, it's
probably past POC stage.

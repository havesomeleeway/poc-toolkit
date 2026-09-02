# Choosing the one slice

Expanded from `METHOD.md` §1. A POC demonstrates **one** thing well. Picking the slice is the
highest-leverage decision.

## Rubric (all five should hold)

| Test | Why it matters |
|---|---|
| **Legible** — a non-expert grasps it in the room without a glossary | A demo that needs explaining before it starts has already lost the audience |
| **Interactive** — something visibly recomputes / changes on input | If nothing responds, a slide deck would do the job cheaper |
| **On-message** — it shows the exact capability the demo exists to prove | Don't build the easiest slice; build the one that makes the point |
| **Buildable with no integrations** — every input, result and side effect can be faked convincingly | Real data/auth/services are out of scope; if it can't be mocked well, choose another slice |
| **Fits the scope** — screen count matches the time budget | ~3–7 screens for a 2–3 min pitch; more only for a longer walkthrough |

## Good signals

- The slice has a clear before/after or input/output the audience already cares about.
- One primary actor, one sitting, one decision or task.
- The requirement leaves the screens/workflow undefined (that gap is what the POC fills).

## Weak signals — reconsider

- Needs several roles coordinating, or spans days of elapsed time.
- The interesting part is a backend algorithm with no user-facing surface.
- "Just show the whole system" — that's a wireframe set, not a POC.

## Output of this step

A one-line slice statement + a numbered screen list. **Confirm both with the user before building.**

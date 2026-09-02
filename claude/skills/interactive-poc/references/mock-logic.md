# Mocking logic without faking precision

Expanded from `METHOD.md` §6. A POC has no integrations, so every result is fabricated. Do it
honestly.

## Rules

1. **Deterministic.** Same inputs → same output, every run. No `Math.random()` in anything the
   audience will read as a result. (Random is fine for throwaway cosmetic things like a demo
   placeholder avatar.)
2. **Small and inspectable.** If the requirement is about *understanding* a result (a breakdown, a
   decision, a calculation), the mock model should be a handful of named steps a viewer could
   follow — not a black box, not a giant lookup table.
3. **Visibly illustrative.** Mark mocked numbers and data consistently: "estimate", "sample",
   "illustrative", "not a real record". Decide the wording once (see `consistency.md`).
4. **Never fake precision.** No invented decimal places, no fabricated IDs/reference numbers shown
   as if issued by a real system, no made-up names of real people or organisations. Round. Say
   "about". Use obviously-synthetic sample identities.
5. **Scope from the requirement.** How much logic exists, and how much shows on screen, is set by
   what the slice needs — not by what's easy or impressive.

## Shape

- Keep the mock model in one place (one function / one object), separate from rendering.
- Parameterise it with the same inputs the UI collects, so changing an input on screen visibly
  moves the output.
- If the real system would have many cases/rules, implement a few representative ones and label
  the rest as out of scope in `HANDOFF.md`.

## Anti-patterns

- Hard-coding the "after" numbers so only one path works.
- A result that looks authoritative (currency, IDs, timestamps) with nothing marking it as fake.
- Recreating the real algorithm — that's implementation, not a POC.

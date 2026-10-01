# Experiment: can a developer rebuild the UI from the spec alone?

Not part of the CLI. Nothing here is tested or published.

`spec-draft.mjs` reads a tagged prototype source and prints one JSON file: the screens as a tree
(layout, components with ids, variants and text, plain elements), the declared features, and the
`flow.json` steps. `sample-spec.json` is its output for `cli/test/fixtures/sample/`.

## The test

1. Open only `sample-spec.json` (not the HTML) and build the same two screens in your own stack.
2. Put the built prototype (`poc-kit build`) next to your version and write down every difference.
3. For each difference, note what the spec did not tell you.

## Gaps already known (so you can skip noting them)

- Mock data and logic are not extracted (the region filter needs them; the table body is empty).
- Text that mixes plain text and inline elements loses its order (`Notes for <span>…</span>`).
- Flow steps use CSS selectors (`#revenue`), not ids.
- Layout is named (`row`, `grid`, `stack`) but has no spacing or sizes.

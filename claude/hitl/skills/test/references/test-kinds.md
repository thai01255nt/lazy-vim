# Test kinds, oracles and the edge checklist

For the test-author. The kind for each AC comes from the task's `### Test plan` row (`kind`, `oracle`, `seam`).
Tags and stub shapes: `${CLAUDE_PLUGIN_ROOT}/shared/tag-grammar.md`, `${CLAUDE_PLUGIN_ROOT}/shared/templates/skeleton-ts.md`,
`${CLAUDE_PLUGIN_ROOT}/shared/templates/skeleton-py.md`.

## Contents
1. Tags and naming (all kinds)
2. Kinds: example, property, concurrency, golden, metamorphic
3. Edge-case checklist
4. Per-framework notes

## 1. Tags and naming (all kinds)

- Keep the stub's tags; change only `@origin skeleton` → `@origin test-author`. New tests get the full set:
  `@covers <ref> @ac T-n.ACk @kind <kind> @origin test-author`.
- Title starts with the AC id: `T-12.AC1 rejects duplicate email in any case`. Python function: `test_T12_AC1_<behaviour>`.
- Turn `it.todo(...)` / `@unittest.skip("TODO(test)…")` / `@pytest.mark.skip` into an active test. Do not leave skips.
- Import the unit under test through the `import paths:` line of the contract pack. Never import private internals.
- Use the project's framework and style (contract pack + `docs/PATTERNS-CONVENTIONS.md`). Do not add dependencies.

## 2. Kinds

### example
Concrete input → expected output from the AC (Given/When/Then). Prefer a small **table** of cases over many near-copies
(`for (const [input, expected] of cases)` / `subTest`). Cover the happy path, each error path named in `@throws`/`Raises`,
and the boundaries from section 3.

### property
An invariant that holds for all inputs (oracle like `invariant: result.email == lower(input)`).
- Use fast-check (TS) or Hypothesis (Py) **only if already a dependency** (check package.json / requirements / pyproject).
- Otherwise: a deterministic generated table (seeded loop over 50–200 inputs, including edge values) asserting the invariant.
- Good properties: round-trip (decode(encode(x)) == x), idempotence (f(f(x)) == f(x)), bounds (0 ≤ total), invariants
  preserved, ordering/permutation insensitivity, monotonicity. Derive them from the docstring wording.

### concurrency
Required when `@concurrency` ≠ none. The test must fail if the guard (lock, atomic op, await) were removed.
- JS/TS: start N overlapping calls with `Promise.all` over the same shared state; assert the invariant (exactly-once,
  no lost update, count == N). Use deterministic interleaving where possible (controlled promises / fake timers; fast-check
  `scheduler` if fast-check is a dependency).
- Python threads: `threading.Barrier` to release N workers at once, repeat 50–200 times, assert the invariant.
  asyncio: `asyncio.gather` over N tasks; run with debug mode; test cancellation leaves consistent state.
- Always assert resource release on the error path (lock released, file/connection closed) by forcing a failure mid-way.
- Bound the runtime (timeouts) so a deadlock fails the test instead of hanging.

### golden
Compare output to a human-validated fixture (`oracle: fixtures/<name>.json`). Never generate the golden file from the code
under test. If the fixture does not exist, write the test against the path and list the fixture in `needsHuman`.

### metamorphic
When the exact output is unknown but a relation between two runs is known: f(x) vs f(transform(x))
(e.g. adding an irrelevant item does not change the total; scaling inputs scales outputs). State the relation in the test title.

## 3. Edge-case checklist (derive from the docstring; skip what is irrelevant)

- empty / null / None / undefined; missing optional fields
- boundaries: 0, 1, max, max+1, negative; empty string vs whitespace
- unicode / case / normalization (e.g. `Ä` vs `Ä`, case-insensitive compares)
- duplicates; ordering (sorted vs unsorted input; stable order of output)
- large inputs (performance cliffs only if the plan mentions them)
- timeouts and cancellation; retries and idempotent retry
- partial failure and rollback (the second write fails → first one undone?)
- resource release on every error path (locks, files, connections, timers)
- security-relevant input when the symbol has a security signal: injection strings (`' OR 1=1 --`, `; rm -rf`), path
  traversal (`../`), oversized payloads, malformed serialized data

## 4. Per-framework notes

- **node:test**: `import { describe, it } from "node:test"; import assert from "node:assert/strict";`
  `await assert.rejects(fn, /duplicate/)`, `assert.throws`. Titles nest as `describe > it`.
- **vitest / jest**: `expect(() => f()).toThrow(/duplicate/)`, `await expect(p).rejects.toThrow(...)`. No snapshot tests for
  logic (they freeze the implementation, not the contract).
- **unittest**: `self.assertRaises(ValueError)`, `self.subTest(case=...)` for tables. No `@skip` left behind.
- **pytest**: `pytest.raises(ValueError, match="…")`, `@pytest.mark.parametrize` for tables.
- Red must come from the stub sentinel or a failed assertion — never from a typo or a wrong import path.

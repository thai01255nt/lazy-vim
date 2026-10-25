# TDD and verification rules (HITL edition)

> Adapted from obra/superpowers (MIT) — `skills/test-driven-development` and `skills/verification-before-completion`,
> Copyright (c) 2025 Jesse Vincent — see NOTICE.md. Changes: re-framed for the skeleton-first flow (tests are written
> from a locked contract by an isolated test-author; implementation by a separate implementer or the human), mechanical
> enforcement via hitl-index and hooks, trimmed examples.

## Contents
1. The iron laws
2. RED — tests from the contract
3. Verify RED
4. GREEN — minimal body
5. Verify GREEN (fresh evidence)
6. Good tests
7. Rationalizations and red flags

## 1. The iron laws

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

In this workflow the order is fixed by tooling: skeleton (stubs + test stubs) → human approve → test-author makes the tests
RED → tests locked → implementer/human makes them GREEN → review. If you watched no test fail, you do not know it tests
the right thing.

## 2. RED — tests from the contract

- Source of truth for expected values: the intent docstring, the TODO(impl) flow, the ACs and the test-plan oracle.
  **Never the implementation** (the test-author never sees bodies). Expected values must come from an independent source;
  a test that recomputes the answer the way the code does is tautological.
- One behaviour per test. The title starts with the AC id: `T-12.AC1 rejects duplicate email in any case`.
- Before writing a test, name the production defect that would make it fail. If you cannot, the test is not worth writing.
- Real code over mocks. Mock only true boundaries (network, clock, randomness, external services) and only after you
  know the side effects of the thing you mock. Never assert on mock behaviour ("called 3 times") when an observable
  result exists.
- Keep test-only helpers in test files/utilities, never in production modules.

## 3. Verify RED (mandatory, never skip)

Run `hitl-index test --task <T> --json`. Each new test must be:
- `fail` with the expected assertion message, or
- `error` whose message contains `TODO(impl)` (the stub's sentinel was reached through the real call path).

Anything else is wrong:
- **passes** → it tests existing behaviour or nothing (vacuous). Tighten it.
- **errors without the sentinel** (import path, syntax, typo, fixture) → fix the test until it fails correctly.

## 4. GREEN — minimal body

- Write the simplest body that follows the TODO(impl) steps in order and makes the locked tests pass.
- No extra options, parameters, modules or "improvements" beyond the contract (YAGNI). No refactoring of other code.
- Test fails? Fix the code, not the test. Locked tests cannot be edited (hook-enforced).
- The contract seems wrong? Stop and report it; contracts change only through the human + `/hitl:approve`.

## 5. Verify GREEN — the gate function

```
BEFORE claiming any status ("green", "done", "fixed", "works"):
1. IDENTIFY: which command proves it?  (hitl-index test --symbol <ref> | --task <T>)
2. RUN: the full command, fresh, in this turn
3. READ: the whole output — counts, outcomes, unmatched, stale
4. VERIFY: does it confirm the claim?  No → state the actual status with evidence.
5. ONLY THEN: make the claim, with the evidence ("3/3 pass, fresh").
```

- "Other tests" means the task's whole test set (`--task`), not just the file you touched. Report every failure by
  name, including ones you did not cause.
- Output must be clean: no unexpected errors or warnings in the run.
- A subagent's "success" is a claim. The orchestrator re-runs the tests before repeating it.
- Regression test for a bug fix: write → run (fails) → fix → run (passes). If you cannot show the red run, you have
  not proven the test catches the bug.

## 6. Good tests

| quality | good | bad |
|---|---|---|
| minimal | one behaviour; "and" in the title → split | `validates email and domain and whitespace` |
| clear | the title states the behaviour and the AC id | `test1` |
| independent oracle | expected value from the AC/intent/table | expected value computed like the code does |
| real | exercises real code through the seam | asserts on mocks |
| deterministic | fixed seeds, fake clock, no sleeps for ordering | timing-dependent, flaky |

## 7. Rationalizations and red flags

| excuse | reality |
|---|---|
| "Too simple to test" | Simple code breaks. The test takes a minute. |
| "I'll test after" | Tests written after pass immediately and prove nothing. |
| "It passes already, good" | Passing on a stub means the test is vacuous. |
| "I'll peek at the implementation to get the values right" | Then the test mirrors the code. Use the contract. |
| "Should pass now" / "looks correct" | Run it. Confidence is not evidence. |
| "The agent said green" | Verify independently. |
| "Just this once" | No exceptions without the human's explicit permission. |

Stop and restart the step when you notice: code before a failing test; a test that never failed; "should", "probably",
"seems to" before a run; satisfaction ("Done!", "Perfect!") before evidence; editing a test to make it pass.

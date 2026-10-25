---
name: test
description: Turns a task's approved test stubs into real failing tests through the isolated test-author subagent (sees only the contract pack, never implementation bodies), verifies they fail for the right reason, records results in the index, and optionally runs mutation testing on changed functions. Use when the user says "test T-12", "viết test", "run tests", after skeleton approval, or when review asks for tests that kill surviving mutants.
argument-hint: "<T-id> [fill|run|mutate] [symbol] [--override]"
allowed-tools: Read Glob Grep Agent Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:test

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md`. Reply in the user's language.
TDD rules: `${CLAUDE_PLUGIN_ROOT}/skills/test/references/tdd-rules.md` (read once per session before `fill`/`mutate`).
Test kinds and edge checklist: `${CLAUDE_PLUGIN_ROOT}/skills/test/references/test-kinds.md` (passed to the test-author).

Arguments: `$ARGUMENTS` → `<T-id> [fill|run|mutate] [symbol]`.
Mode default: `fill` if the task still has `todo`/`skip` test stubs written at skeleton time, else `run`.
`--override` comes only from `/hitl:implement <T> --lane fast` (user's override of a high-risk task): lock like low risk,
with `--by human-override`. Never add it yourself.

## Iron rules

- **Tests come from the contract, never from an implementation.** Only `hitl:test-author` writes test bodies, and it
  gets the contract pack — never source bodies, never this session's history.
- **You (main thread) never edit test files.** Locked tests are hook-protected; unlocked ones still go through the test-author.
- **A test that passes against a stub is vacuous.** It proves nothing. Send it back.
- Results are data: `hitl-index test` exits 0 even when tests fail. Read the JSON, never the exit code alone.

## Preconditions

`hitl-index status <T> --json` and `hitl-index tasks --json`:
- not initialized → 🛑 `Run /hitl:setup first.`
- task status `todo`/`skeleton` (skeleton not approved) → 🛑 `Run /hitl:approve <T> first` (low risk: `/hitl:implement <T>` runs the fast lane).
- `fill` when tests are already locked → ask: ⛔ GATE `Tests for <T> are locked. 1. add tests for new ACs only 2. run them (run) 3. cancel`.

## Mode `fill`

1. **Contract pack**: `hitl-index context <T> --contract --out .hitl/index/contracts/<T>.md`.
   Read it. Extract the test file paths (the `tests:` lines) and the test-plan rows.
   Rows with `author: human` are not delegated: list them as `✍️ yours: T-n.ACk (<kind>)`.
2. **Spawn `hitl:test-author`** (Agent tool, `subagent_type: hitl:test-author`). Prompt, nothing else:
   ```
   Task: <T>. Contract pack: .hitl/index/contracts/<T>.md (read it first).
   Test files you may edit: <paths>. Rows to fill: <ac → kind → oracle → seam>, skip author=human rows.
   Kinds/edge checklist: ${CLAUDE_PLUGIN_ROOT}/skills/test/references/test-kinds.md
   Test command: hitl-index test --task <T> --json
   Every test must FAIL against the current stubs for the right reason. Return the JSON from your Output section.
   ```
3. **RED check**: `hitl-index index <test files> --json`, then `hitl-index test --task <T> --json`. For every filled/added test:
   | outcome | verdict |
   |---|---|
   | `fail` (assertion) | ✅ red for the right reason |
   | `error` with `TODO(impl)` in the message | ✅ red (sentinel reached) |
   | `error` without the sentinel (import, syntax, type, fixture) | ❌ broken → bounce |
   | `pass` | ❌ vacuous (passes on a stub) → bounce |
   | `skip` / still `todo` | ❌ not filled → bounce |
   Also check: each AC in the task has ≥1 active test (`@ac`), and `unmatched` is empty (⚠️ list otherwise).
4. **Bounce** (max 2 rounds): send the same test-author a follow-up (SendMessage if available, else a new spawn with the
   same prompt plus the list): `These tests are not red for the right reason: <testId → outcome → message>. Fix them.`
   After 2 bounces, stop bouncing and report them as `needsHuman`.
5. **Lock**:
   - Risk **high** (no `--override`): ⛔ GATE — print the table, then the line below, end turn.
     ```
     | ac | test | kind | result |
     |----|------|------|--------|
     | T-12.AC1 | rejects duplicate email in any case | example | ❌ fail (expected throw) |
     ```
     `Review tests in <files>, then /hitl:approve <T> tests  •  or tell me what to change.`
   - Risk **low** (and the RED check is clean): `hitl-index approve <T> --stage tests --by auto`, print `⚡ tests auto-locked`.
     If the RED check is not clean, do not auto-lock: 🛑 show the failures.
   - `--override` (and the RED check is clean): `hitl-index approve <T> --stage tests --by human-override` (alone, no
     chaining), print `⚠️⚡ tests locked by human override`. Same rule: a dirty RED check never locks.
   - 🎯 next: `/hitl:implement <T>` (after the approval for high risk).

## Mode `run`

`hitl-index test --task <T> [--symbol <ref>] --json`, then print per symbol:
```
| symbol | impl | status | pass | fail | skip | stale |
```
plus the first failure message per failing test. Works for manual functions too. Then `hitl-index status <T> --sync-tags`.
Stale results (body changed since the run) are not evidence; say so.

## Mode `mutate`

1. `hitl-index mutate --task <T> --json`.
   `{configured:false}` → 💡 print how to configure it and stop:
   - TS/JS: Stryker (`npm i -D @stryker-mutator/core`), then
     `hitl-index init --set commands.mutation.ts="npx stryker run --mutate {mutate} --reporters json,clear-text"`
     (`{mutate}` = changed function ranges; the `json` reporter writes the `reports/mutation/mutation.json` the CLI reads).
   - Python: mutmut 3 (`pip install mutmut`), then `hitl-index init --set commands.mutation.py="mutmut run"`.
   Mutation is optional (`mutationRequired: false` by default).
2. Print per symbol: score, survivors (location + mutated operator).
   Ignore `@impl manual` survivors for auto-fixing: list them for the human.
3. Survivors on agent-owned symbols → spawn `hitl:test-author` with the contract pack and the survivor list:
   `Add a test that kills each survivor. Expected values come from the contract/ACs; if the mutant is equivalent
   (no observable behaviour change), say so in notes instead of writing a test.`
4. `hitl-index test --task <T> --json`: the new killer tests must **pass** on the real body (they target mutants, not stubs).
   A killer test that fails on the real body is either a real bug (report it, `🎯 /hitl:review <T>`) or a wrong test (bounce once).
5. Re-run `hitl-index mutate --task <T> --json` and print before → after.
6. Re-lock: risk high → ⛔ GATE `New tests added: <list>. Review, then /hitl:approve <T> tests`.
   Risk low → `hitl-index approve <T> --stage tests --by auto` (re-locks accept green tests, but each needs a fresh run;
   never add `--force`). If the CLI refuses, print its reason and stop.

## Output

Always end with a one-line status and `🎯 next:`. No completion claim without the fresh `hitl-index test` run in this turn.

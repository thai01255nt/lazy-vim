---
name: skeleton
description: Drafts code skeletons for one hitl task (signatures, intent docstrings, TODO flow, failing sentinel) plus test stubs per acceptance criterion, then stops for human review. Use for "skeleton", "stub", "draft functions", "tạo skeleton", or after tasks are approved.
argument-hint: "<T-id> [--quick [--override]]"
allowed-tools: Read Glob Grep Write Edit Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:skeleton — stubs + intent + test stubs

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md` + `${CLAUDE_PLUGIN_ROOT}/shared/conventions-code.md`.
Patterns (read the one per language before writing): `${CLAUDE_PLUGIN_ROOT}/shared/templates/skeleton-ts.md`,
`${CLAUDE_PLUGIN_ROOT}/shared/templates/skeleton-py.md`. Tags: `${CLAUDE_PLUGIN_ROOT}/shared/tag-grammar.md`.

Arguments: `$ARGUMENTS` — `<T-id>` and optional `--quick` (fast lane: no gate, auto-approve; low-risk only).
`--quick --override` comes only from `/hitl:implement <T> --lane fast` (the user's override of a high-risk task):
same as `--quick` but approves with `--by human-override`. Never add `--override` yourself.

Never write business logic here. Bodies are TODO(impl) steps + the sentinel (or untouched existing code for `modify`).

## 1. Select the task
- `hitl-index tasks --json`. No T-id given → use the first frontier task from `hitl-index status --json` and say `💡 Assumed: <T>`.
- Unknown id → ❌ list valid ids, stop.
- `--quick` on a high-risk task without `--override` → `🛑 Fast lane is for low-risk tasks only (<T> is high: <reasons>).` Drop `--quick` and continue normally.
- Blocked by unfinished tasks → ⛔ GATE `⚠️ <T> is blocked by T-11 (status wip), T-9 (todo). Continue anyway? (y/N)` END THE TURN.
- Already locked (`hitl-index status <T> --json` shows approved or later) → `⚠️ <T> skeleton is locked. Signature/intent changes will need /hitl:approve <T> again.` and continue.

## 2. Load (no questions)
- The task section (ACs, Symbols, Test plan, Notes) and the design decisions its `**Why**` cites (`D-n` in the change's
  `design.md`; `hitl-index context <T> --json` shows them with the AC scenarios).
- `docs/PATTERNS-CONVENTIONS.md`; `hitl.config.json` (`commands.test`, `commands.typecheck`, `testGlobs`).
- `hitl-index context <T> --json` → existing targets, callers, neighbours, public types.
- The skeleton pattern file(s) for the languages involved and `tag-grammar.md`.

## 3. Write stubs, in `### Symbols` order
For each row (`@prio` = row number):
- **modify** → edit the symbol in place: update the intent docstring, add tags, add `TODO(impl): n. …` lines where the new
  steps belong. Keep working code. Add the sentinel only when the body will be fully rewritten.
- **new** → create it in the stated file, following file/naming patterns. Create the file only if the row says so
  (`creates file`) or the file is the row's stated path and does not exist.
- Every target symbol gets:
  - intent docstring: what + business rule, params/returns/throws (prose lines);
  - `@task <T> @impl <row owner> @status skeleton @prio <n>` on one line;
  - `@calls <short refs>` (declared collaborators; omit if none) and `@concurrency none|shared-state|async|locks|io`;
  - `@dec D-n` on its own line only on the symbols that embody a D-n cited in the task's `**Why**` whose *cost if
    wrong* matters (typically 0–3 per task; never required; not hashed). Ids must exist in the change's `design.md`;
  - numbered `TODO(impl): 1. …` steps (the flow a reviewer will map), then the sentinel
    (TS `throw new Error("TODO(impl): <ref>")`, Py `raise NotImplementedError("TODO(impl): <ref>")`).
- New classes that host the stubs: intent + `@task <T> @impl agent @status skeleton` (avoids ORPHAN), no sentinel.
- Types/interfaces used by signatures: full field types, no sentinel. Unknown fields → `// TODO(impl): define …`.
- A needed helper not in `### Symbols` → add a row to the task's `### Symbols` (same format, next number) and stub it;
  mention it at the gate. Never add helpers silently.
- Respect `@impl manual` rows: stub only, same as agent rows (the human writes the body later).

## 4. Write test stubs
- One stub per `### Test plan` row, in the project's test location and framework (PATTERNS `Testing Conventions`, config test command).
- Title starts with the AC id (`T-12.AC1 …`); tags `@covers <ref> @ac <T-n.ACk> @kind <kind> @origin skeleton`.
- Body: `it.todo(...)` (TS) / skipped test with docstring only (Py). No assertions.
- Any covered symbol with `@concurrency` ≠ none and no concurrency row → add a `@kind concurrency` stub and add the row to the Test plan.
- Never edit existing locked tests; add new stubs beside them.

## 5. Index and validate (loop until clean, max 3)
1. `hitl-index index <changed files…> --json`.
2. `hitl-index drift --task <T> --json`. Fix every warn about this task: missing/bad tags (`BAD_TAG`), `ORPHAN`,
   `AMBIGUOUS_REF` / unresolved `@calls`, ACs without a stub, `PARSE_ERROR`.
3. `hitl-index tasks --check --json` (Symbols refs must resolve).
   `hitl-index trace <T> --json`: fix every `block` item (DEC_UNKNOWN, AC_UNKNOWN, COVERS_UNRESOLVED). Gaps
   (`AC_NO_TEST`, `SYMBOL_NO_TEST`, …) are info at this stage; mention only real omissions at the gate.
4. Typecheck if `commands.typecheck` is set: run it; stubs must compile. Fix only skeleton-caused errors.

## 6. ⛔ GATE — human review
```
🦴 Skeleton <T> — <title>  (risk: high (security) | <n> symbols | <m> test stubs)

| prio | symbol                 | file                       | impl   | calls                         | TODO steps | tests          |
|------|------------------------|----------------------------|--------|-------------------------------|------------|----------------|
| 1    | UserService.createUser | src/services/userService.ts| agent  | UserRepo.findByEmail, …save   | 3          | AC1, AC2       |
| 2    | UserRepo.findByEmail   | src/repo/userRepo.ts       | manual | —                             | 2          | AC1            |

Open in your editor:
- src/services/userService.ts
- src/repo/userRepo.ts
- tests/userService.test.ts
<added helpers / typecheck notes / drift leftovers, if any>

Review/edit in your editor (you may change signatures, intents, @impl owners, add/remove stubs).
Then: /hitl:approve <T>  •  or tell me what to change.
```
Linear (optional, fail-open): if `hitl-index status --json` `tasks[T].linear` exists and `onBranch` is false, add one
line `🎯 branch: git switch -c <branch>` above `Then:` (run no git command; `linear` null → nothing).
END THE TURN. Never self-approve. On change requests: apply them, redo step 5, show the gate again.

**Fast-lane exception** (`--quick`, or invoked from `/hitl:implement` for a low-risk task): skip the gate, print
`⚡ Skeleton auto-approved (low risk)`, run `hitl-index approve <T> --stage skeleton --by auto --json`, and return
control to the caller. If the CLI refuses (exit 1), print its reasons with 🛑 and stop at the gate above instead.
With `--override`: print `⚠️⚡ Skeleton approved by human override (high risk)` and run
`hitl-index approve <T> --stage skeleton --by human-override --json` (alone, no chaining). Hook denies ("override is
human-only") → 🛑 `Override token missing. Type /hitl:implement <T> --lane fast again.` and stop at the gate above.

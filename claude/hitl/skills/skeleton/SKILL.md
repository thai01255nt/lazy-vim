---
name: skeleton
description: Drafts code skeletons for one hitl task (signatures, intent docstrings, TODO flow, failing sentinel) plus test stubs for the test plan's new tests, then stops for human review. Use for "skeleton", "stub", "draft functions", "tạo skeleton", or after tasks are approved.
argument-hint: "<task-id> [--quick [--override]]"
allowed-tools: Read Glob Grep Write Edit Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:skeleton — stubs + intent + test stubs

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md` + `${CLAUDE_PLUGIN_ROOT}/shared/conventions-code.md`.
Patterns (read the one per language before writing): `${CLAUDE_PLUGIN_ROOT}/shared/templates/skeleton-ts.md`,
`${CLAUDE_PLUGIN_ROOT}/shared/templates/skeleton-py.md`, `${CLAUDE_PLUGIN_ROOT}/shared/templates/skeleton-lua.md`.
Other languages (no template): follow the TS shape in the language's own doc-comment tool, and keep that tool's
binding rules (never put prose or tags between a type-annotation block and the signature annotations).
Tags: `${CLAUDE_PLUGIN_ROOT}/shared/tag-grammar.md`.

Arguments: `$ARGUMENTS` — `<task-id>` and optional `--quick` (fast lane: no gate, auto-approve; low-risk only).
`--quick --override` comes only from `/hitl:implement <T> --lane fast` (the user's override of a high-risk task):
same as `--quick` but approves with `--by human-override`. Never add `--override` yourself.

Never write business logic here. Bodies are TODO(impl) steps + the sentinel (or untouched existing code for `modify`).

## 1. Select the task
- `hitl-index tasks --json`. No task id given → use the first frontier task from `hitl-index status --json` and say `_Assumed:_ <T>`.
- Unknown id → ❌ list valid ids, stop.
- `--quick` on a high-risk task without `--override` → `_Stop:_ Fast lane is for low-risk tasks only (<T> is high: <reasons>).` Drop `--quick` and continue normally.
- Blocked by unfinished tasks → GATE `⚠️ <T> is blocked by PWR-T11 (status wip), PWR-T9 (todo). Continue anyway? (y/N)` END THE TURN.
- Already locked (`hitl-index status <T> --json` shows approved or later) → `⚠️ <T> skeleton is locked. Signature/intent changes will need /hitl:approve <T> again.` and continue.
- `reopened` with `reopen.stage: skeleton` (the human reopened it after a contract change) → **reopen mode**: change only
  the `reopen.symbols` (signature, intent, TODO steps) to the amended spec/design; keep everything else, keep the tests
  (they are reopened; `/hitl:test <T>` rewrites them after the approval). Gate: `/hitl:approve <T> skeleton <symbols>`.
  An in-progress task an amendment changed (`amend: <KEY>-A<n>` in its meta, `shared/task-changes.md` §1) also gets its
  `TODO(impl)` steps refreshed to the new ACs, so the implementer gets steps, not only red tests.
- An amend task (0.17): `remove` rows get no stub (the implement step deletes them); a `rewrite:` test-plan row gets no
  stub either (the taken-over test is the stub; `/hitl:test` rewrites it). Kind `prep` changes structure only: its
  intents stay as they are.

## 2. Load (no questions)
- The task section (ACs, Symbols, Test plan, Notes) and the design decisions its `**Why**` cites (`<KEY>-D<n>` in the change's
  `design.md`; `hitl-index context <T> --json` shows them with the AC scenarios).
- `.hitl/docs/PATTERNS-CONVENTIONS.md`; `.hitl/hitl.config.json` (`commands.test`, `commands.typecheck`, `testGlobs`).
- `hitl-index context <T> --json` → existing targets, callers, neighbours, public types.
- The skeleton pattern file(s) for the languages involved and `tag-grammar.md`.

## 3. Write stubs, in `### Symbols` order
For each row (`@prio` = row number; it only breaks ties — implement order is callees first over `@calls`):
- **modify** → edit the symbol in place: rewrite the whole intent as one current contract (never append a sentence
  per task; after an amendment no history words such as "previously", "now returns", "no longer", `tag-grammar.md` §2
  "Intent-only after an amendment"; drift and the review warn `INTENT_HISTORY`, opt-out `hitl: history-ok` only when
  the compatibility is the contract), add tags, add `TODO(impl): n. …` lines where the new steps belong. Keep working code. Add the sentinel
  only when the body will be fully rewritten.
  Already tagged by an earlier task → append yours (`@task PWR-T2, PWR-T3`), set `@status skeleton` and this task's `@prio`.
  If another not-done task also has `TODO(impl)` lines in it, scope yours: `TODO(impl <T>): n. …`.
- **new** → create it in the stated file, following file/naming patterns. Create the file only if the row says so
  (`creates file`) or the file is the row's stated path and does not exist.
- Every target symbol gets:
  - intent docstring: what + business rule, params/returns/throws (prose lines). Keep the intent to what this
    symbol guarantees: a callee states its own rules; an orchestrator lists the outcome order and names the callee or enum
    (`already settled → checkAlreadySettled`, `statuses: SettleStatusEnum`); an enum alone defines each status.
    No ids in prose (`<KEY>-T<n>`, `<KEY>-T<n>.AC<k>`, `<KEY>-D<n>`, spec ids like `KEY-R3`/`KEY-R3.S1`/`KEY-BR1`, change ids): decisions go
    in `@dec`, requirement links live in tasks.md AC refs and tests' `@ac`;
  - `@task <T> @impl <row owner> @status skeleton @prio <n>` on one line;
  - `@calls <short refs>` (declared collaborators; omit if none) and `@concurrency none|shared-state|async|locks|io`;
  - `@dec <KEY>-D<n>` on its own line only on the symbols that embody a <KEY>-D<n> cited in the task's `**Why**` whose *cost if
    wrong* matters (typically 0–3 per task; never required; not hashed). Ids must exist in the change's `design.md`;
  - numbered `TODO(impl): 1. …` steps (the flow a reviewer will map; each a short intent label, not pseudo-code: see
    "Step wording" in the skeleton template), then the sentinel
    (TS `throw new Error("TODO(impl): <ref>")`, Py `raise NotImplementedError("TODO(impl): <ref>")`).
- Signatures for testability (`${CLAUDE_PLUGIN_ROOT}/shared/test-patterns.md` §3–§4): take ports in (repo, mailer,
  clock), one method per external operation, return results. A behaviour a test could only see through a side channel
  → reshape the signature now and say so at the gate.
- New classes that host the stubs: intent + `@task <T> @impl agent @status skeleton` (avoids ORPHAN), no sentinel.
- Types/interfaces used by signatures: full field types, no sentinel. Unknown fields → `// TODO(impl): define …`.
- A needed helper not in `### Symbols` → add a row to the task's `### Symbols` (same format, next number) and stub it;
  list it in its caller's `@calls` (that, not the row position, puts it before the caller in the work order);
  mention it at the gate. Never add helpers silently.
- Respect `@impl manual` rows: stub only, same as agent rows (the human writes the body later).

## 4. Write test stubs
- One stub per `new` row of the `### Test plan`, in AC order (AC1 first), in the project's test location and framework
  (PATTERNS `Testing Conventions`, config test command). `describe` = the row's seam. A `shared: <ACk>` row adds its AC
  id to the `@ac` of ACk's stub (one stub, several ids); `covered:`, `none:` and `manual:` rows get no stub (the lock
  checks that a `covered:` test exists). A table without a `test` column (before 0.16): one stub per row.
- Name = the behaviour in `## Terms` words, never a planning id (test-patterns §1): TS `it("rejects duplicate email
  ignoring case")`, Python `test_rejects_duplicate_email_ignoring_case`. The ids live only in `@ac`; a name unique in
  its file (a repeated name blocks the tests lock). Tags `@covers <ref> @ac <KEY>-T<n>.AC<k> [more AC ids] @kind <kind>
  @origin skeleton`, and `@catches <the row's defect>` on its own line.
- Body: `it.todo(...)` (TS) / skipped test with docstring only (Py). No assertions.
- Any covered symbol with `@concurrency` ≠ none and no concurrency row → add a `@kind concurrency` stub and add the row
  (`new: <the race it catches>`) to the Test plan.
- Never edit existing locked tests; add new stubs beside them. Existing tests with ids in their names stay as they are.

## 5. Index and validate (loop until clean, max 3)
1. `hitl-index index <changed files…> --json`.
2. `hitl-index drift --task <T> --json`. Fix every warn about this task: missing/bad tags (`BAD_TAG`), `ORPHAN`,
   `AMBIGUOUS_REF` / unresolved `@calls`, `new`/`shared` ACs without a stub, `PARSE_ERROR`, ids in intent prose
   (`INTENT_TASK_REF`).
3. `hitl-index tasks --check --json` (Symbols refs must resolve).
   `hitl-index trace <T> --json`: fix every `block` item (DEC_UNKNOWN, AC_UNKNOWN, COVERS_UNRESOLVED). Gaps
   (`AC_NO_TEST`, `SYMBOL_NO_TEST`, …) are info at this stage; mention only real omissions at the gate.
4. Typecheck if `commands.typecheck` is set: run it; stubs must compile. Fix only skeleton-caused errors.

## 6. GATE — human review
```
Skeleton <T> — <title>  (risk: high (security) | <n> symbols | <m> test stubs)

| prio | symbol                 | file                       | impl   | calls                         | TODO steps | tests          |
|------|------------------------|----------------------------|--------|-------------------------------|------------|----------------|
| 1    | UserService.createUser | src/services/userService.ts| agent  | UserRepo.findByEmail, …save   | 3          | AC1, AC2       |
| 2    | UserRepo.findByEmail   | src/repo/userRepo.ts       | manual | —                             | 2          | AC1            |

Open in your editor:
- src/services/userService.ts
- src/repo/userRepo.ts
- tests/userService.test.ts
<added helpers / typecheck notes / drift leftovers, if any>

<intent diff per modify row: approved → new>
Review/edit in your editor (you may change signatures, intents, @impl owners, add/remove stubs).
Then: /hitl:approve <T>  •  or tell me what to change.
```
Intent diff: for each `modify` row show the approved intent → the new one (drift `INTENT_CHANGED` `approved.intent` /
`current.intent`; the previous docstring when never locked), so the reviewer sees a rewrite, not an appended sentence.
Ticket tracker (optional, fail-open): if `hitl-index status --json` `tasks[T].linear` is non-null and `tasks[T].linear.onBranch` is false, add one
line `_Branch:_ git switch -c <tasks[T].linear.branch>` above `Then:` (run no git command; `linear` null → nothing).
END THE TURN. Never self-approve. On change requests: apply them, redo step 5, show the gate again.

**Fast-lane exception** (`--quick`, or invoked from `/hitl:implement` for a low-risk task): skip the gate, print
`_Fast_ skeleton auto-approved (low risk)`, run `hitl-index approve <T> --stage skeleton --by auto --json`, and return
control to the caller. If the CLI refuses (exit 1), print its reasons with _Stop:_ and stop at the gate above instead.
With `--override`: print `⚠️ _Fast_ skeleton approved by human override (high risk)` and run
`hitl-index approve <T> --stage skeleton --by human-override --json` (alone, no chaining). Hook denies ("override is
human-only") → _Stop:_ `Override token missing. Type /hitl:implement <T> --lane fast again.` and stop at the gate above.

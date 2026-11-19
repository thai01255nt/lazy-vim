# Changing tasks that exist (per-state rules, 0.17)

Used by `/hitl:tasks <id> update` (every update of an existing tasks.md) and by the **amend task set** of an amend
brief (`shared/amend-spec.md` §4). One rule set for both: what may happen to a task depends only on how far its work
got. Ideas adapted (no text): spec-kit / Kiro "append new tasks, keep done ones done", Nygard ADR supersede, Fowler
parallel change (expand → migrate → contract), Beck "make the change easy, then make the easy change" — see NOTICE.md.

Terms:
- **amendment** — one change to an approved spec delta or design of an active change, id `<KEY>-A<n>` (`PWR-A1`).
- **amend task set** — the tasks an amendment adds or changes, each marked `amend: <KEY>-A<n>` in its meta line.
- **in progress** — the task has locked work (approved skeleton, locked tests) or code, and no done record.
- **cleanup work** — work with no new behaviour: revert, remove dead code, migrate data, rewrite or delete tests.

## 1. The rule per task state

| state of the task | what an update or an amendment does |
| --- | --- |
| `todo` (no locked work, no code tagged with it) | **edit in place**: title, ACs, Symbols rows, `**Why**`, test plan, Notes; or **drop** it (`hitl-index tasks drop <T> --reason "…" [--amend <KEY>-A<n>]`) |
| in progress (skeleton or tests locked, red / wip / green, not done) | **reopen in place**: edit its ACs, Symbols rows and test plan, and refresh its TODO steps at the skeleton reopen; the lock reopens only through the human's `/hitl:approve <id> reopen` |
| `done` | **never reopened**: a new task (new id) takes over (§2) |
| `dropped` | history: never edited again, its id is never reused |

- Cleanup work always gets a new task id (kind `contract`, `revert` or `migrate`, §3), even when an existing task
  touched the same code.
- Ids are never renumbered or reused. A dropped task keeps its heading, ACs and the `**Dropped**:` line.
- Only the CLI writes `status:` (also `dropped`) and the boxes. `tasks drop` refuses a task with locked work or code
  tagged `@task <T>`.

## 2. A done task: a new task takes over

A done task keeps its done record and its review. The new task (kind `switch` or `contract`):
- names the done task's symbols in its `### Symbols` with `modify` (changed) or `remove` (deleted);
- takes over each locked test of the done task that asserts the old behaviour with a test-plan row
  `rewrite: <test id, test title or the old AC id>` (rewrite it to the new AC, or delete it when the AC says the old
  behaviour is gone); a test that still holds is a `covered: <test>` row;
- the done task's stale ACs get one line each under its `### Acceptance criteria`:
  `- superseded: PWR-T12.AC2 → PWR-T15.AC1 (PWR-A1)` (`→ none` when the behaviour is removed). A superseded AC is
  history: its ref may name a removed scenario, trace stops counting it, and the successor carries the coverage.

The take-over itself is a lock change, so the human confirms it: `note apply --amend <KEY>-A<n>` lists it in the recheck
note, `/hitl:approve <id> reopen` moves each test to the new task (stage `reopened`, `takenFrom` recorded; the old task's
lock entry lists it under `takenOver`). The new task's tests stage then needs each taken-over test rewritten to its AC
and red against the current code, or deleted.

**Tests of an archived change.** A locked test that a task of an archived change owns and that the amendment's new
behaviour contradicts follows the same path: a `rewrite:` row in the new task names it, the human's reopen moves it to
the new task, the test-author rewrites it, the new task locks it. The archived change is never reopened and its files
never change; the lock (`takenFrom`) and the amend brief (its Affected list and Close) are the record.

## 3. Work kinds and order

The meta line of an amend task: `- prio: P1 | risk: low | impl: agent | blocked-by: PWR-T15 | amend: PWR-A1 | kind:
contract | status: todo` (`amend:` and `kind:` before `status:`; tasks without them read as before 0.17).

| kind | what | when |
| --- | --- | --- |
| `prep` | make the change easy: restructure, no behaviour change; ACs "existing tests stay green" + the seam | the new logic does not fit the current shape |
| `expand` | add the new form beside the old one (function, field, column, contract version, flag) | the old behaviour is merged or released |
| `migrate` | move the callers, or the stored data, to the new form | callers or stored data use the old form |
| `switch` | the new behaviour: changed logic and its ACs (a normal vertical slice) | always (the amendment itself) |
| `contract` | remove what the amendment made dead: old branch, helper, flag, column, tests of removed scenarios | something became unreachable or wrong |
| `revert` | restore the base for half-done work the human chose not to keep (`[K]` revert) | only after a `[K]` revert answer |

The transition answer of the amend brief picks the shape (`transition:` in its header):
- **in this branch only** (`branch`): `prep` (if needed) → `switch` → `contract`. No `expand` or `migrate`.
- **merged** or **released**: `prep` → `expand` → `migrate` → `switch` → `contract`. (0.17 checks the kinds and their
  order only; guidance for data migration of released behaviour comes later.)

Order lives in `blocked-by`: a task of a later kind is blocked (directly or through other tasks) by every task of an
earlier kind of the same amendment. An `expand` needs a `contract` in the same set (the old form must go).

## 4. Symbols rows `remove`

```
2. [ ] `ResetJob.sweep` | remove | `src/reset/job.ts` | impl: agent | dead after the switch to expiry on read
```

- A remove row is work that deletes the symbol: it is not one of the task's symbols (no skeleton stub, no status).
  The implement step deletes it and every use of it after the task's other rows are green.
- The task is not finished while the symbol exists: status stays `wip` (a task of remove rows only: `todo`), and
  `/hitl:approve <T> done` refuses with `REMOVE_STILL_PRESENT`; `tasks --check` reports a done task whose remove
  row still exists.
- Evidence: every remove row names a symbol that exists in the index when the task is written (no invented dead code).

## 5. Checks (`hitl-index tasks --check`, `hitl-index amend check <id>`)

| code | meaning |
| --- | --- |
| `TASK_KIND_BAD` | `kind:` is not one of the six, or has no `amend:` |
| `AMEND_KEY_MISMATCH` | `amend:` or a superseded line's amendment does not carry the task's key |
| `TASK_DROPPED_NO_REASON` | `status: dropped` without a `**Dropped**:` line, or the reverse |
| `TASK_DROPPED_LOCKED` | a dropped task holds locked work |
| `SUPERSEDED_UNKNOWN` | a superseded line names an AC the task does not have, or an unknown successor |
| `REMOVE_STILL_PRESENT` | a done task's remove row still exists in the index |
| `AMEND_ORDER` | a later kind is not blocked by an earlier kind of the same amendment; a kind the transition answer does not allow; an `expand` without a `contract` |
| `AMEND_UNCOVERED` | an item the amendment touches (by traceability: AC, task, spec id, symbol, locked test) is handled by no task of its set and is not listed under `## Unchanged` in its amend brief |

## 6. A full re-slice

`/hitl:tasks <id>` on an existing tasks.md is always an update (there is no overwrite). When every task is still
`todo`, a different slicing is an update that drops the old tasks and adds new ones: the quiz gate lists the ids it
will drop and the new ids, and the drops (`hitl-index tasks drop`) run only after the human's Y.

# Feature run (`/hitl:implement --feature <planning-or-tasks-file> [--lane fast]`)

Runs every task of one tasks file in order, each through its own lane, and stops **once** at the end with a combined
review. Same iron rules as SKILL.md for every task (implementer for agent bodies, human for manual bodies, fresh
evidence before any claim). Resume = the same command: already-implemented tasks are skipped.

## 1. Plan

`hitl-index feature <file> [--lane fast] --json` (pass `--lane fast` only if the user typed it). Exit 1 → ❌ print its
`error` and `candidates`, stop. It returns `items[]` in run order (topological by blocked-by, then prio, then id) with
`lane` (`fast` low risk · `override` high risk + `--lane fast` · `normal` high risk), `action`, `status`, `drift`,
plus `current`, `phase`, `stop`, `cycle`, `overrideTasks`.

Print once:
```
🎯 Feature feat-auth — 4 tasks (.hitl/tasks/feat-auth.md)
| # | task | risk | lane | status | action |
|---|------|------|------|--------|--------|
| 1 | T-11 Hash passwords | low | ⚡ fast | done | skip |
| 2 | T-12 Register user | high (security) | ⚠️ override | todo | implement |
```
`overrideTasks` not empty → print the ⚠️ HUMAN OVERRIDE block of SKILL.md **once** for the whole run, listing each
override task with its risk reasons. The user's `--feature … --lane fast` prompt issued one override token bound to
this feature's tasks; it covers `--by human-override` for any of them during this run.
`cycle` not empty → ⚠️ name the tasks (they run last, in prio order).

## 2. Loop (one task at a time, in `items` order)

Before each task, re-run `hitl-index feature <file> [--lane fast] --json` and take `current`:
- `phase: "review"` → step 3.
- `stop` set → 🛑 print it and `🎯 resume: /hitl:implement --feature <file>[ --lane fast]` (after the human step). End.
  (`stop` covers block-level drift, a human approval a normal-lane task waits for, and a task blocked outside the feature.)
- `current.action`:
  - `implement` → run SKILL.md steps 1–5 for `current.id` as if the user typed `/hitl:implement <T> --all`
    (lane `override` → with `--lane fast`, `BY = human-override`; lane `fast` → `BY = auto`). No per-symbol gates for
    agent symbols in any lane except `normal` high risk, which keeps its "Method done. Continue?" gate.
  - `skeleton` → invoke the `hitl:skeleton` skill for the task: it stops at its ⛔ gate. End the turn there.
  - `test` → invoke the `hitl:test` skill (`<T> fill`): high risk stops at its lock gate. End the turn there.
- After an `implement` task: fresh `hitl-index test --task <T> --json` and `hitl-index drift --task <T> --json`.
  Print `✅ T-12 green (n tests) — next: T-13` and continue with the next task **in the same turn**.

Stop early (🛑 + resume line, end the turn) when:
- a task stays red/stuck after the implementer's retry budget (SKILL.md step 3 `stuck`, max 3 iterations + the one
  hinted retry the user may give) — print the failing evidence as SKILL.md does;
- `drift --task` shows a `block` item (or the plan's `stop` names block drift) → `🎯 /hitl:sync`;
- a manual symbol needs the human (SKILL.md manual hand-off gate). The user's "done" reply continues the same task, and
  then the loop goes on in that turn;
- a `contractIssue` / `specConflict` card (SKILL.md step 3).

## 3. Combined review (the single stop at the end)

1. For every task in run order whose status is `green` or `review` (or `verified`/`done` without a review on record):
   invoke the `hitl:review` skill with `<T> --in-feature` (full review, no per-task gate). Run them one after another.
2. `hitl-index feature <file> --report --json` → writes `.hitl/reviews/feature-<name>.md`
   (per-task verdict, risk, override, trace ⛔/⚠️, pending findings). Print the report body (one screen) and its path.
3. ⛔ GATE — one question for the whole feature:
   ```
   Decide: T-12 F-1 (accept/reject/defer/amend), T-13 F-2 … — or "fix T-12 F-1".
   ⚠️ Override tasks need your review of every function: T-12 (.hitl/reviews/T-12.review.md)
   Then per task: /hitl:approve <T> done
   ```
   No pending findings and no override task → ✅ `Feature <name>: all tasks PASS` and the next frontier task
   (`hitl-index status --json` `.next`). End the turn.
   `--report --json` `securityLensTasks` not empty (and the report has no `full audit:` line) → add one line, suggest
   only, never run it: `💡 Security lens ran on T-12, T-13 — full audit: /hitl:review --security-audit <file>`.

Replies like `fix T-12 F-1` or `accept T-12 F-1` → run the matching `/hitl:review <T> …` decision/fix path, then
re-run step 3.2 and print the new summary.

---
name: flow
description: Hitl workflow status: active changes, task status, drift, notes, and the next command; also task id routing and the workflow help. Use when the user asks "status", "where are we", "what next", "tiếp theo làm gì", "đang ở đâu", names a task id without a phase, or asks how the hitl workflow works. Not for describing new work to build or fix (/hitl:go) or checking overlap between changes (/hitl:overlap).
argument-hint: "[task-id|help]"
allowed-tools: Read Glob Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:flow — status, task id routing, help

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md`. This skill has no gate and never edits files.

Status summary (injected):
!`node ${CLAUDE_PLUGIN_ROOT}/scripts/hitl-index.mjs status --brief --soft`

Arguments: `$ARGUMENTS`

## Route

1. Status summary says "not initialized" → `❌ HITL not initialized here. _Next:_ /hitl:setup`. Stop.
   Status summary (or any `hitl-index` output) reports `IDS_LEGACY` (pre-0.13 ids: `T-n`, `D-n`, capability keys,
   `hitl.lock/1`) → `⚠️ This project still uses pre-0.13 ids. _Next:_ /hitl:migrate` and one line why (every id now
   starts with its change key, e.g. `PWR-T3`). Stop: other commands refuse until it is migrated.
2. `help` (or the user asks how the workflow works) → Read `${CLAUDE_SKILL_DIR}/references/help.md` and print its
   Help block (the lanes, the diagram and the command table); stop.
2b. A bare quick key (`QFLT`, 2–5 capitals, a quick file's key in `hitl-index status --json` `.quick[]`) → its set:
   `_Next:_ /hitl:tasks <key>` while `.quick[].tasks` is draft or its brief is open, else its task's `next`. Stop.
3. The user described a **new piece of work** (not a task id, not a status question) → `_Next:_ /hitl:go <description>`
   and one line why (it picks the route: a note or amend of an active change, `/hitl:tdd`, `/hitl:tasks quick` or
   `/hitl:plan`). Stop. A change to an active change's approved behaviour stated in chat gets the note gate of
   conventions "Edits to approved behaviour stated in chat" first.
4. Status (default, or a task id):
   - `hitl-index status [T] --json`. First, when `.changes[]` is non-empty, one line per active change:
     `_Change:_ feat-password-reset — phase: implement · tasks 1/2 done` (phases: spec → design → tasks → implement →
     archive-ready; `archive-ready` → `_Next:_ /hitl:archive <id>`). A change with `.changes[].brief` whose `kind` matches
     its phase (spec → plan, design → design) and `pending > 0` → one more line (0.14, the brief file of
     `/hitl:plan` / `/hitl:design`): `_Brief:_ <id> — <kind> brief round <round>: <unanswered> unanswered → answer <file>,
     then /hitl:<plan|design> <id>` (no unanswered left → `→ /hitl:<plan|design> <id>` to process the answers).
     Then print the frontier tasks table, sorted by prio then id (max 10 rows; say `+N more`):

```
| task | title                       | prio | risk | status   | drift | next                    |
|------|-----------------------------|------|------|----------|-------|-------------------------|
| PWR-T12 | Register user (unique email)| P1   | high | red      | ⚠️ 1  | /hitl:implement PWR-T12    |
| PWR-T13 | Login                       | P2   | low  | todo     | —     | /hitl:implement PWR-T13    |
```
   - Any `tasks[T].linear` non-null (the tracker entry of any provider; the field keeps its old name) → add an `issue`
     column after `status`: the issue id (`ENG-123`, `PAY-7`, `#12`), plus ` _Queued_` when
     `synced` is false; `—` for unmapped tasks. All null → no column.
   - With a task id: also list its symbols (`symbol | impl | status | reasons`) from the same JSON.
   - `tasks[T].override` true → append ` ⚠️ override` to its risk cell (the user forced the fast lane; review goes to the human).
   - `tasks[T].testOverride` → ` ⚠️ test override` in its risk cell, plus ` (no brief record)` when a
     `tasks[T].testOverrideSource` value is null (TEST_OVERRIDE_UNRECORDED).
   - Notes (0.9): `.changes[].notes` with `open` or `reopenPending` > 0 → one line per change
     `_Note_ feat-x — 2 open notes, 1 reopen pending`. Then every task with `tasks[T].notes` non-empty, even when not in the
     table: `_Note_ PWR-T14 blocked by N-3 (<title>) → <apply>` (routing skips it while another task can go on).
   - Waits (0.12): each `.changes[].wait` → its `for[]` as `_Waits:_ <id> waits for <change> (<notes>)` (` — gone: the human
     dismisses its notes` when `state` is `gone`) and its `amend[]` as `_Take in:_ <id> must take in <N-k> from <source> → <apply>`.
     Tasks with `tasks[T].wait` get ` _Waits:_ <change>` in the status cell: no approval or implement until the wait ends.
   - Tasks briefs (0.21): `.changes[].brief.kind` `tasks` (phase tasks, or an update round in any phase) →
     `_Brief:_ <id> — tasks brief round <n>: <unanswered> unanswered → <next>`; each `.quick[]` with an open brief or a
     draft set → `_Brief:_ quick <key> — tasks brief round <n> (<tasks>) → answer <file>, then /hitl:tasks <key>`. Every
     task with `tasks[T].tasksHold` → ` _Held:_ draft task set` / ` _Held:_ tasks brief` in the status cell and its
     `next` cell = `tasksHold.apply` (TASKS_NOT_APPROVED: nothing is built before the approve Y).
   - Amendments (0.17): `.changes[].brief.kind` `amend` → `_Brief:_ <id> — amend brief <amend> round <n> (<status>) → <next>`.
     Every task with `tasks[T].amendHold` → ` _Held:_ <amendHold.amend>` in the status cell and its `next` cell =
     `amendHold.apply` (no implement until the amendment is approved; untouched tasks go on). `tasks[T].amend` → append
     ` (<amend> <kind>)` to the title cell; status `dropped` → listed only with a task id or `all`.
   - `tasks[T].status` `reopened` → status cell `_Reopen_ (<reopen.stage>)` and one line
     `_Reopen_ PWR-T12 reopened by <reopen.note> — <tests to rewrite for reopen.acs | skeleton of reopen.symbols> → <next>`.
   - Several unfinished tasks in one change → mention once `_Tip:_ build then review: /hitl:implement --feature <change-id>`.
   - `.trace` non-null and `.trace.acs.total > 0` → one line
     `_Trace:_ R <reqs.covered>/<reqs.active> covered · scenarios <scenarios.withAc>/<scenarios.total> with AC ·
     AC <acs.proven>/<acs.total> proven · _Block_ <block> · ⚠️ <warn>` (no percentages; omit missing parts).
   - `.tickets.queued > 0` → `⚠️ <n> <.tickets.label> update(s) queued → /hitl:tickets push`.
   - Any drift on locked symbols → `⚠️ Drift on approved skeleton → /hitl:sync` (this overrides next).
   - Else `.trace.block > 0` → `_Next:_ hitl-index trace --json and fix the references` (this overrides next).
   - End with `_Next:_ <.next from status --json>` and one line why.
   - No tasks at all → the first active change's `next` from `.changes[]` / `hitl-index change --json`
     (`answer <brief file>, then /hitl:plan <id>`, `/hitl:design <id>`, `/hitl:tasks <id>`, `/hitl:archive <id>`),
     else `_Next:_ /hitl:go <description>`.
   - `.hitl/planning/*.md` exists (v0.5) → one line `_Tip:_ v0.5 planning files — /hitl:plan offers the migration`.

Status comes from tooling only (`hitl-index status`); never infer it from `@status` tags or checkboxes.

---
name: flow
description: Hitl workflow status: active changes, task status, drift, notes, and the next command; also T-id routing and the workflow help. Use when the user asks "status", "where are we", "what next", "tiếp theo làm gì", "đang ở đâu", names a T-id without a phase, or asks how the hitl workflow works. Not for describing new work to build or fix (/hitl:go).
argument-hint: "[T-id|help]"
allowed-tools: Read Glob Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:flow — status, T-id routing, help

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md`. This skill has no gate and never edits files.

Current brief status (injected):
!`node ${CLAUDE_PLUGIN_ROOT}/scripts/hitl-index.mjs status --brief --soft`

Arguments: `$ARGUMENTS`

## Route

1. Brief status says "not initialized" → `❌ HITL not initialized here. 🎯 next: /hitl:setup`. Stop.
2. `help` (or the user asks how the workflow works) → Read `${CLAUDE_SKILL_DIR}/references/help.md` and print its
   Help block (the lanes, the diagram and the command table); stop.
3. The user described a **new piece of work** (not a T-id, not a status question) → `🎯 next: /hitl:go <description>`
   and one line why (it picks the route: a 📌 note or amend of an active change, `/hitl:tdd`, `/hitl:tasks quick` or
   `/hitl:plan`). Stop. A change to an active change's approved behaviour stated in chat gets the 📌 gate of
   conventions "Changes stated in chat" first.
4. Status (default, or a `T-id`):
   - `hitl-index status [T] --json`. First, when `.changes[]` is non-empty, one line per active change:
     `📦 feat-password-reset — phase: implement · tasks 1/2 done` (phases: spec → design → tasks → implement →
     archive-ready; `archive-ready` → `🎯 /hitl:archive <id>`). Then print the frontier tasks table, sorted by prio then id (max 10 rows; say `+N more`):

```
| task | title                       | prio | risk | status   | drift | next                    |
|------|-----------------------------|------|------|----------|-------|-------------------------|
| T-12 | Register user (unique email)| P1   | high | red      | ⚠️ 1  | /hitl:implement T-12    |
| T-13 | Login                       | P2   | low  | todo     | —     | /hitl:implement T-13    |
```
   - Any `tasks[T].linear` non-null (the tracker entry of any provider; the field keeps its old name) → add an `issue`
     column after `status`: the issue id (`ENG-123`, `PAY-7`, `#12`), plus ` ⏳` when
     `synced` is false; `—` for unmapped tasks. All null → no column.
   - With a `T-id`: also list its symbols (`symbol | impl | status | reasons`) from the same JSON.
   - `tasks[T].override` true → append ` ⚠️ override` to its risk cell (the user forced the fast lane; review goes to the human).
   - Notes (0.9): `.changes[].notes` with `open` or `reopenPending` > 0 → one line per change
     `📌 feat-x — 2 open notes, 1 reopen pending`. Then every task with `tasks[T].notes` non-empty, even when not in the
     table: `📌 T-14 blocked by N-3 (<title>) → <apply>` (routing skips it while another task can go on).
   - Links (0.10): each `.changes[].links[]` → `🔗 <id> <rel> <change> (<level>)` + ` · <n> tasks paused` when `paused`
     is non-empty; each `.changes[].reconcilePending[]` → `🔄 <id>: reconcile pending from <from> → <command>`.
   - `tasks[T].status` `reopened` → status cell `🔁 reopened (<reopen.stage>)` and one line
     `🔁 T-12 reopened by <reopen.note> — <tests to rewrite for reopen.acs | skeleton of reopen.symbols> → <next>`.
   - Several unfinished tasks in one change → mention once `💡 build then review: /hitl:implement --feature <change-id>`.
   - `.trace` non-null and `.trace.acs.total > 0` → one line
     `🔗 trace: R <reqs.covered>/<reqs.active> covered · scenarios <scenarios.withAc>/<scenarios.total> with AC ·
     AC <acs.proven>/<acs.total> proven · ⛔ <block> · ⚠️ <warn>` (no percentages; omit missing parts).
   - `.tickets.queued > 0` → `⚠️ <n> <.tickets.label> update(s) queued → /hitl:tickets push`.
   - Any drift on locked symbols → `⚠️ Drift on approved skeleton → /hitl:sync` (this overrides next).
   - Else `.trace.block > 0` → `🎯 next: hitl-index trace --json and fix the references` (this overrides next).
   - End with `🎯 next: <.next from status --json>` and one line why.
   - No tasks at all → the first active change's `next` from `.changes[]` / `hitl-index change --json`
     (`/hitl:design <id>`, `/hitl:tasks <id>`, `/hitl:archive <id>`), else `🎯 next: /hitl:go <description>`.
   - `.hitl/planning/*.md` exists (v0.5) → one line `💡 v0.5 planning files — /hitl:plan offers the migration`.

Status comes from tooling only (`hitl-index status`); never infer it from `@status` tags or checkboxes.

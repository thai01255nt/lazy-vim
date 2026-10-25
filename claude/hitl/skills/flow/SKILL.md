---
name: flow
description: Shows where the project is in the HITL skeleton-first workflow (plan → tasks → skeleton → approve → test → implement → review → done), lists tasks by priority with computed status and drift, and recommends the next command. Use when the user asks "status", "where are we", "what next", "tiếp theo làm gì", describes a new task without naming a phase, or asks how the hitl workflow works.
argument-hint: "[T-id|help]"
allowed-tools: Read Glob Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:flow — router and status

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md`. This skill has no gate and never edits files.

Current brief status (injected):
!`node ${CLAUDE_PLUGIN_ROOT}/scripts/hitl-index.mjs status --brief --soft`

Arguments: `$ARGUMENTS`

## Route

1. Brief status says "not initialized" → `❌ HITL not initialized here. 🎯 next: /hitl:setup`. Stop.
2. `help` (or the user asks how the workflow works) → print the **Help** block below and stop.
3. The user described a **new piece of work** (not a T-id, not a status question):
   - 🔍 Glob `.hitl/planning/*.md` and match file names / `#` titles against the description.
   - Covered by an existing planning file → `🎯 next: /hitl:tasks <file>` (or `/hitl:plan <file>` if it is still `status: draft`).
   - Trivial change (≤1 function, no public interface, no security/concurrency) → `⚡ Fast lane: /hitl:tasks quick <description>` then `/hitl:implement <T>`.
   - Otherwise → `🎯 next: /hitl:plan <description>`.
   State the reason in one line. Stop.
4. Status (default, or a `T-id`):
   - `hitl-index status [T] --json`. Print the frontier tasks table, sorted by prio then id (max 10 rows; say `+N more`):

```
| task | title                       | prio | risk | status   | drift | next                    |
|------|-----------------------------|------|------|----------|-------|-------------------------|
| T-12 | Register user (unique email)| P1   | high | red      | ⚠️ 1  | /hitl:implement T-12    |
| T-13 | Login                       | P2   | low  | todo     | —     | /hitl:implement T-13    |
```
   - Any `tasks[T].linear` non-null → add a `linear` column after `status`: the issue id (`ENG-123`), plus ` ⏳` when
     `synced` is false; `—` for unmapped tasks. All null → no column.
   - With a `T-id`: also list its symbols (`symbol | impl | status | reasons`) from the same JSON.
   - `tasks[T].override` true → append ` ⚠️ override` to its risk cell (the user forced the fast lane; review goes to the human).
   - Several unfinished tasks in one tasks file → mention once `💡 whole feature: /hitl:implement --feature <tasks file>`.
   - `.trace` non-null and `.trace.acs.total > 0` → one line
     `🔗 trace: R <reqs.covered>/<reqs.active> covered · AC <acs.proven>/<acs.total> proven · ⛔ <block> · ⚠️ <warn>`
     (no percentages).
   - `.tickets.queued > 0` → `⚠️ <n> Linear update(s) queued → /hitl:tickets push`.
   - Any drift on locked symbols → `⚠️ Drift on approved skeleton → /hitl:sync` (this overrides next).
   - Else `.trace.block > 0` → `🎯 next: hitl-index trace --json and fix the references` (this overrides next).
   - End with `🎯 next: <.next from status --json>` and one line why.
   - No tasks at all → `🎯 next: /hitl:plan <description>`, or `/hitl:tasks <planning>` when an approved planning file has no tasks file.

## Help

```
/hitl:setup → /hitl:overview → /hitl:plan → /hitl:tasks
                                              │
          high risk ──────────────────────────┤──────────── low risk (⚡ fast lane)
              ▼                               │                    ▼
   /hitl:skeleton T ⛔ → /hitl:approve T      │        /hitl:implement T (auto skeleton+tests)
   /hitl:test T ⛔ → /hitl:approve T tests    │                    │
   /hitl:implement T (✍️ manual fns ⛔)        │                    │
              ▼                               ▼                    ▼
   /hitl:review T ⛔ → /hitl:approve T done           /hitl:review T → auto done on PASS
   User-only override: /hitl:implement T --lane fast (high risk, no gates; review always goes to you)
   Whole feature: /hitl:implement --feature <tasks file> [--lane fast] → one combined review at the end
   Manual edits outside Claude → /hitl:sync
   Optional side channel: /hitl:tickets push (mirror tasks to Linear; never a gate for the flow)
```

| command | purpose | gate |
|---|---|---|
| `/hitl:setup` | init `.hitl`, detect test cmds, opt-in pre-commit | ⛔ user-only |
| `/hitl:overview` | BUSINESS / ARCHITECTURE / PATTERNS docs + generated CODEBASE-MAP | ⛔ if docs exist |
| `/hitl:plan` | behaviour (R-n) then design (D-n) rounds → planning md; `<file> amend` | ⛔ each round |
| `/hitl:tasks` | vertical-slice tasks, risk, ACs, test plan | ⛔ quiz |
| `/hitl:skeleton T` | stubs + intent tags + TODO flow + test stubs | ⛔ review in editor |
| `/hitl:approve T [stage]` | lock skeleton / tests / done | user-only |
| `/hitl:test T` | real failing tests via isolated test-author | ⛔ high risk |
| `/hitl:implement T` | agent fns via implementer, manual fns handed to you | ⛔ manual fns |
| `/hitl:implement --feature F` | all tasks of a tasks file in order, one combined review | ⛔ end / early stop |
| `/hitl:review T` | L0 gates + lens reviewers + report | ⛔ if human needed |
| `/hitl:sync` | reconcile manual edits, drift + trace report, amend spec | ⛔ user-only |
| `/hitl:tickets` | mirror tasks to Linear (optional) | ⛔ first push |
| `/hitl:flow` | this status / router | — |

Status comes from tooling only (`hitl-index status`); never infer it from `@status` tags or checkboxes.

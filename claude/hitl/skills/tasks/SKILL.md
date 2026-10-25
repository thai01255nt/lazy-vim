---
name: tasks
description: Breaks an approved planning file into vertical-slice tasks sorted by priority, each with risk level and reasons, acceptance criteria linked to requirements (R-n), target symbols (exact file, new/modify, owner agent/manual, purpose) and a test plan, written to .hitl/tasks/[same-name].md and checked with hitl-index trace for human review. Use after planning, or when the user says "tasks", "break down", "chia task", "tạo task", or asks for a quick low-risk task.
argument-hint: "[planning-file-name | quick <description>]"
allowed-tools: Read Glob Grep Write Edit Agent Skill Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:tasks — task breakdown

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md`. Rules for slicing, priority, risk, ACs, owners and the test plan:
read `${CLAUDE_SKILL_DIR}/references/slicing-and-risk.md` before drafting. Format: `${CLAUDE_PLUGIN_ROOT}/shared/templates/tasks.md`
(exact; parsed by `hitl-index tasks`).

Arguments: `$ARGUMENTS`

## 1. Resolve the source
- `quick <description>` → quick mode: no planning file. Target `tasks/quick-<slug>.md`, header `← Planning: none`, one task.
- Else the planning file = argument, else the one used in this conversation, else 🔍 Glob `planning/*.md` and match the
  user's words. Several matches → ⛔ GATE `Use which planning file? (1/2/…)` END THE TURN.
- None → `🛑 No planning file. Run /hitl:plan first.` Stop.
- Planning `status: draft` → `⚠️ Planning is still draft (open questions: <n>).` Continue; it is reported again at the gate.
- Target = `tasks/<same name>.md`. It exists → ⛔ GATE `` `<name>.md` exists. (update/new/overwrite) — 💡 update`` END THE TURN.
  - update: keep existing task ids, statuses and checkboxes; edit or add tasks; remove tasks only if the
    user agrees at the quiz gate. new: suggest `<name>-2.md`. overwrite: only for tasks with status `todo`.

## 2. Load (no questions)
- The planning file, `docs/PATTERNS-CONVENTIONS.md`, `docs/CODEBASE-MAP.md` (if present), `.hitl/hitl.config.json`
  (`risk.corePaths`, `risk.securityPaths`).
- `hitl-index tasks --json` (existing tasks and ids). `hitl-index next-id` → first new id; number further tasks sequentially.

## 3. Facts (never guess)
For every candidate target symbol: `hitl-index context <ref> --json` (exists? file? callers?) or Grep.
Decide `new` vs `modify` from that. Choose the file from existing structure (PATTERNS) and write its exact path.
Many unknowns → one Explore subagent (thoroughness: medium) with the list. Record reuse hints in `### Notes`.

## 4. Draft
Per `slicing-and-risk.md`: vertical slices (prefactor first, expand–contract for wide refactors), `blocked-by` edges,
prio P0–P3, risk with reasons, 2–6 ACs `T-n.ACk`, symbols in implement order with owner, test-plan row per AC.
- Each AC carries `(R-n)` right after its id for the requirement it instantiates, when the planning has
  `## Requirements`: `- [ ] T-12.AC1 (R-1) Given … When … Then …`. Only active R ids.
- `**Why**` cites the decisions it implements: `… (D-1, D-2)`.
- Quick mode: one task, no `(R-n)`, no `D-n`; risk per the rules; high → tell the user and recommend `/hitl:plan` at the gate.

## 5. Write and validate (loop until clean)
1. 📝 Write the file: header (`# <Feature> Tasks`, `← Planning: …`, `> status: draft`), then tasks sorted by prio.
   Meta line exactly: `- prio: P1 | risk: high (security, public-api) | impl: mixed | blocked-by: T-11 | status: todo`
   (`blocked-by: none` when empty; new tasks start `status: todo`; boxes `[ ]`).
2. `hitl-index tasks --check --json`. Fix every error (duplicate ids, unknown blocked-by, missing meta, `modify` target missing,
   `new` symbol already exists, AC without test-plan row, bad ref form, unknown/dropped `R-n`, unknown `D-n`) and re-run.
3. Not quick: `hitl-index trace <planning-file> --json`. Fix every `block` item (REQ_UNKNOWN, REQ_INACTIVE, DEC_UNKNOWN, …)
   in the same loop. `warn`/`info` items (REQ_NO_AC, DEC_UNUSED, AC_NO_REQ, REQ_NO_DEC) become consistency lines at the gate.
   Max 3 loops for steps 2–3; then show the remaining errors.

## 6. ⛔ GATE (quiz)
```
📋 tasks/<name>.md — <n> tasks (<h> high, <l> low) · planning: <name>.md (<status>)

| id   | title                         | prio | risk (reasons)        | impl   | blocked-by |
|------|-------------------------------|------|-----------------------|--------|------------|
| T-11 | Extract PasswordHasher        | P0   | low                   | agent  | —          |
| T-12 | Register user (unique email)  | P1   | high (security, api)  | mixed  | T-11       |

<consistency lines: trace warn/info (one line per code: ids) + semantic checks from slicing-and-risk.md §8, if any>
1. Granularity ok?  2. Blocking edges right?  3. Merge/split?  4. Owners (agent/manual) ok?
— reply changes, or Y
```
END THE TURN. On changes: edit, re-run step 5, show the gate again. On Y: set the header `> status: approved`
(this header line only; never task `status:` fields or boxes) and print:
- `✅ Tasks approved.`
- `🎯 next:` first frontier task — high risk → `/hitl:skeleton <T>`; low risk → `/hitl:implement <T>` (⚡ fast lane).
- Linear (optional, fail-open): `hitl-index tickets status --json`. If `enabled && configured && autoPush.onTasksApproved`
  → invoke the Skill `hitl:tickets` with `push <tasks-file> --auto`. Its output is informational; never change this
  skill's result because of it (error or missing command → skip silently).

## Rules
- Write only the tasks file. Signatures belong to `/hitl:skeleton`, not here.
- Never edit task `status:` values or `[ ]/[x]` boxes of existing tasks (tooling owns them).
- No effort estimates, story points or scores.

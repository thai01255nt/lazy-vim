---
name: tasks
description: Breaks an approved hitl change into prioritized vertical-slice tasks (risk, acceptance criteria → spec scenarios, target symbols, test plan) in tasks.md. Use after /hitl:design or /hitl:plan, or for "tasks", "break down", "chia task", "tạo task", or a quick low-risk task.
argument-hint: "[<change-id> | quick <description>]"
allowed-tools: Read Glob Grep Write Edit Agent Skill Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:tasks — task breakdown

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md` + `${CLAUDE_PLUGIN_ROOT}/shared/conventions-spec.md`. Rules for slicing, priority, risk, ACs, owners and the test plan:
read `${CLAUDE_SKILL_DIR}/references/slicing-and-risk.md` before drafting. Format: `${CLAUDE_PLUGIN_ROOT}/shared/templates/tasks.md`
(exact; parsed by `hitl-index tasks`).

Arguments: `$ARGUMENTS`

## 1. Resolve the source
- `quick <description>` → quick mode: no change. Target `.hitl/tasks/quick-<slug>.md`, header `← Change: none`, one task.
- Else the change id = argument, else the one used in this conversation, else `hitl-index change --json` and the active
  changes in phase `tasks` (or matching the user's words). Several → ⛔ GATE `Use which change? (1/2/…)` END THE TURN.
- None → `🛑 No change. Run /hitl:plan first.` Stop. A v0.5 planning file name → `🛑 v0.5 planning — migrate first
  (/hitl:plan offers it, or hitl-index migrate --specs).` Stop.
- Proposal `status: draft` → `⚠️ Spec is still draft (open questions: <n>).` Design `draft` → `⚠️ Design is still draft.`
  Design `missing` and not skipped → `⚠️ No design yet (💡 /hitl:design <id>).` Continue; all repeated at the gate.
- Target = `.hitl/changes/<id>/tasks.md`. It exists → ⛔ GATE `` `tasks.md` exists. (update/overwrite) — 💡 update`` END THE TURN.
  - update: keep existing task ids, statuses and checkboxes; edit or add tasks; remove tasks only if the
    user agrees at the quiz gate. overwrite: only for tasks with status `todo`.

## 2. Load (no questions)
- `hitl-index spec show --change <id> --json` (effective view: requirements, scenarios with GIVEN/WHEN/THEN, rules,
  origin `added|modified|living`), the proposal (`## Out of scope`, `## Unchanged behaviour`), `design.md`
  (Decisions, Components, Test strategy, Risks, Contracts), `data-model.md` and `contracts/` when present.
- `docs/PATTERNS-CONVENTIONS.md`, `docs/CODEBASE-MAP.md` (if present), `.hitl/hitl.config.json`
  (`risk.corePaths`, `risk.securityPaths`).
- `hitl-index tasks --json` (existing tasks and ids). `hitl-index next-id` → first new id; number further tasks sequentially.

## 3. Facts (never guess)
For every candidate target symbol: `hitl-index context <ref> --json` (exists? file? callers?) or Grep.
Decide `new` vs `modify` from that. Choose the file from existing structure (PATTERNS) and the design's components;
write its exact path. Many unknowns → one Explore subagent (thoroughness: medium) with the list. Reuse hints → `### Notes`.

## 4. Draft
Per `slicing-and-risk.md`: vertical slices (prefactor first, expand–contract for wide refactors), `blocked-by` edges,
prio P0–P3, risk with reasons, 2–6 ACs `T-n.ACk`, symbols in implement order with owner, test-plan row per AC.
- Tasks come from the **scenarios** (behaviour) sliced along the design's **components** (where it lives).
- Each AC carries the scenario it instantiates right after its id: `- [ ] T-12.AC1 (ACC-R3.S1) Given … When … Then …`.
  Only ADDED/MODIFIED (or living, for a regression AC) ids of the change's view. A requirement-level ref `(ACC-R3)` is
  allowed but gives `AC_REQ_LEVEL` info; prefer the scenario. Several refs: `(ACC-R3.S1, ACC-BR1)`.
- `**Why**` cites the design decisions it implements: `… (D-1, D-2)`. No design (skipped) → cite the requirement ids.
- Symbols (`### Symbols`) are the first place code names appear: they belong here, not in the spec or design.
- Quick mode: one task, no spec refs, no `D-n`; risk per the rules; high → tell the user and recommend `/hitl:plan` at the gate.

## 5. Write and validate (loop until clean)
1. 📝 Write the file: header (`# <Title> Tasks`, `← Change: <id>`, `> status: draft`), then tasks sorted by prio.
   Meta line exactly: `- prio: P1 | risk: high (security, public-api) | impl: mixed | blocked-by: T-11 | status: todo`
   (`blocked-by: none` when empty; new tasks start `status: todo`; boxes `[ ]`).
2. `hitl-index tasks --check --json`. Fix every error (duplicate ids, unknown blocked-by, missing meta, `modify` target missing,
   `new` symbol already exists, AC without test-plan row, bad ref form, unknown/removed scenario or requirement, unknown `D-n`) and re-run.
3. Not quick: `hitl-index trace <change-id> --json`. Fix every `block` item (`REQ_UNKNOWN`, `SCN_UNKNOWN`,
   `RULE_UNKNOWN`, `REQ_INACTIVE`, `DEC_UNKNOWN`, `CHANGE_MISSING`, …) in the same loop. `warn`/`info` items
   (`SCN_NO_AC`, `REQ_NO_AC`, `DEC_UNUSED`, `AC_NO_REQ`, `AC_REQ_LEVEL`, `REQ_NO_DEC`) become consistency lines at the gate.
   Max 3 loops for steps 2–3; then show the remaining errors.

## 6. ⛔ GATE (quiz)
```
📋 changes/<id>/tasks.md — <n> tasks (<h> high, <l> low) · spec: <status> · design: <status|skipped>

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
- Ticket tracker (optional, fail-open): `hitl-index tickets status --json`. If `enabled && configured && autoPush.onTasksApproved`
  → invoke the Skill `hitl:tickets` with `push <change-id> --auto`. Its output is informational; never change this
  skill's result because of it (error or missing command → skip silently).

## Rules
- Write only the tasks file. Signatures belong to `/hitl:skeleton`, not here.
- Never edit task `status:` values or `[ ]/[x]` boxes of existing tasks (tooling owns them).
- No effort estimates, story points or scores.

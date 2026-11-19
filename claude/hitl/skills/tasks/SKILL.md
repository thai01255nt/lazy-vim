---
name: tasks
description: Breaks an approved hitl change into prioritized vertical-slice tasks (risk, acceptance criteria → spec scenarios, target symbols, test plan) in tasks.md. Use after /hitl:design or /hitl:plan, or for "tasks", "break down", "chia task", "tạo task", "tasks quick", "task nhanh", or when /hitl:go routes here. Not for a bare description of new work without a task ask (/hitl:go).
argument-hint: "[<change-id> [update [<what>]] | quick <description>]"
allowed-tools: Read Glob Grep Write Edit Agent Skill Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:tasks — task breakdown

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md` + `${CLAUDE_PLUGIN_ROOT}/shared/conventions-spec.md`. Rules for slicing, priority, risk, ACs, owners and the test plan:
read `${CLAUDE_SKILL_DIR}/references/slicing-and-risk.md` before drafting. Format: `${CLAUDE_PLUGIN_ROOT}/shared/templates/tasks.md`
(exact; parsed by `hitl-index tasks`). An existing tasks.md (an update): also `${CLAUDE_PLUGIN_ROOT}/shared/task-changes.md`
(what may happen to a task per its state).

Arguments: `$ARGUMENTS`

## 1. Resolve the source
- `quick <description>` → quick mode: no change. Target `.hitl/tasks/quick-<slug>.md`, one task. Its id and key come from
  `hitl-index next-id --quick <slug> --json` → `{next: "QFLT-T1", key: "QFLT"}` (a fresh key per quick file, no gate);
  header `← Change: none | key: <key>`; ACs `<key>-T1.AC<k>`. Never `QT` (legacy).
- Else the change id = argument, else the one used in this conversation, else `hitl-index change --json` and the active
  changes in phase `tasks` (or matching the user's words). Several → GATE `Use which change? (1/2/…)` END THE TURN.
- None → `_Stop:_ No change. Run /hitl:plan first.` Stop. A v0.5 planning file name → `_Stop:_ v0.5 planning — migrate first
  (/hitl:plan offers it, or hitl-index migrate --specs).` Stop.
- Proposal `status: draft` → `⚠️ Spec is still draft (open questions: <n>).` Design `draft` → `⚠️ Design is still draft.`
  Design `missing` and not skipped → `⚠️ No design yet (_Tip:_ /hitl:design <id>).` Continue; all repeated at the gate.
- Target = `.hitl/changes/<id>/tasks.md`. It exists → **update** (no question; there is no overwrite).
  `<change-id> update [<what>]` (from `/hitl:go`, a note's apply command or an amend route) is the same; `<what>` is the
  work to add. Update rules (`shared/task-changes.md`):
  - keep existing task ids, statuses and checkboxes; never renumber or reuse an id;
  - per task state: a `todo` task is edited in place, or dropped (`hitl-index tasks drop`, after Y at the quiz gate);
    an in-progress task is edited in place (a new scenario on its requirement → a new AC, next AC number; its locked
    tests reopen only through `/hitl:approve <id> reopen`); a **done** task is never edited: new work on its code or
    behaviour is a new task (it names the symbols `modify`/`remove`, takes over old-behaviour tests with `rewrite:`
    rows, and the done task's stale ACs get `superseded:` lines, task-changes.md §2);
  - a change of approved behaviour or design is not an update: `/hitl:plan <id> amend` (`shared/amend-spec.md`);
  - a full re-slice while every task is still `todo`: drop the old tasks and add new ones — the quiz gate lists both,
    the drops run after Y (task-changes.md §6).
  A test-plan table without the `test` column (before 0.16) stays as it is; when you add a row to it, add the column
  to that table and give each old row its decision (`new: <defect>` for the tests it already has).

## 2. Load (no questions)
- `hitl-index spec show --change <id> --json` (effective view: requirements, scenarios with GIVEN/WHEN/THEN, rules,
  origin `added|modified|living`), the proposal (`## Out of scope`, `## Unchanged behaviour`), `design.md`
  (Decisions, Components, Test strategy, Risks, Contracts), `data-model.md` and `contracts/` when present.
- `.hitl/specs/GLOSSARY.md` and the change's `glossary.md` (if present): the words for titles and ACs.
- `.hitl/docs/PATTERNS-CONVENTIONS.md`, `.hitl/docs/CODEBASE-MAP.md` (if present), `.hitl/hitl.config.json`
  (`risk.corePaths`, `risk.securityPaths`).
- `hitl-index tasks --json` (existing tasks and ids). `hitl-index next-id <change-id>` → first new id
  `<KEY>-T<n>` (the change key; quick mode: the id and key from §1); number further tasks sequentially.

## 3. Facts (never guess)
For every candidate target symbol: `hitl-index context <ref> --json` (exists? file? callers?) or Grep.
Decide `new` vs `modify` from that. Choose the file from existing structure (PATTERNS) and the design's components;
write its exact path. Many unknowns → one Explore subagent (thoroughness: medium) with the list. Reuse hints → `### Notes`.

## 4. Draft
Per `slicing-and-risk.md`: vertical slices (prefactor first, expand–contract for wide refactors), `blocked-by` edges,
prio P0–P3, risk with reasons, 2–6 ACs `<KEY>-T<n>.AC<k>`, symbols with owner (callers before or after callees is fine: implement order is computed from `@calls`, row order breaks ties), a test-plan row per AC with its test decision (`new: <defect>` · `shared: <ACk>` · `covered: <test>` · `none: <reason>` · `manual: <check>`, `slicing-and-risk.md` §7).
- Tasks come from the **scenarios** (behaviour) sliced along the design's **components** (where it lives).
- Each AC carries the scenario it instantiates right after its id: `- [ ] PWR-T12.AC1 (PWR-R3.S1) Given … When … Then …`.
  Only ADDED/MODIFIED (or living, for a regression AC) ids of the change's view. A requirement-level ref `(PWR-R3)` is
  allowed but gives `AC_REQ_LEVEL` info; prefer the scenario. Several refs: `(PWR-R3.S1, SGN-BR1)` (spec ids carry the key of the change that created them).
- `**Why**` cites the design decisions it implements: `… (PWR-D1, PWR-D2)`. No design (skipped) → cite the requirement ids.
- Symbols (`### Symbols`) are the first place code names appear: they belong here, not in the spec or design.
- Quick mode: one task, no spec refs, no `<KEY>-D<n>`; risk per the rules; high → tell the user and recommend `/hitl:plan` at the gate.
  A trivial change (wording, constant, log line) usually gets `none: <reason>` or `covered: <test>` instead of a new test.

## 5. Write and validate (loop until clean)
1. Write the file: header (`# <Title> Tasks`, `← Change: <id>` — quick: `← Change: none | key: <key>` — `> status: draft`), then tasks sorted by prio.
   Meta line exactly: `- prio: P1 | risk: high (security, public-api) | impl: mixed | blocked-by: PWR-T11 | status: todo`
   (`blocked-by: none` when empty; a task of another change is named by its own id, e.g. `FEE-T2`; new tasks start `status: todo`; boxes `[ ]`).
   An amend task (amend-spec.md §4.4) adds `| amend: PWR-A1 | kind: switch` before `| status:` (task-changes.md §3).
   Update: write only the new and edited tasks; a task you plan to drop stays as it is until Y (its check errors are expected).
2. `hitl-index tasks --check --json`. Fix every error (duplicate ids, unknown blocked-by, missing meta, `modify` target missing,
   `new` symbol already exists, AC without test-plan row, test-plan codes `TEST_PLAN_BAD|NO_DEFECT|EMPTY|SHARED|COVERED|NONE_RISK`,
   bad ref form, unknown/removed scenario or requirement, unknown `<KEY>-D<n>`,
   `TASK_KEY_MISMATCH`, `QUICK_KEY_TAKEN` → a fresh `next-id --quick <slug>` key in the header and the ids; 0.17:
   `TASK_KIND_BAD`, `AMEND_KEY_MISMATCH`, `TASK_DROPPED_*`, `SUPERSEDED_UNKNOWN`, `REMOVE_STILL_PRESENT`, `AMEND_ORDER`,
   `AMEND_UNCOVERED`, task-changes.md §5) and re-run.
3. Not quick: `hitl-index trace <change-id> --json`. Fix every `block` item (`REQ_UNKNOWN`, `SCN_UNKNOWN`,
   `RULE_UNKNOWN`, `REQ_INACTIVE`, `DEC_UNKNOWN`, `CHANGE_MISSING`, …) in the same loop. `warn`/`info` items
   (`SCN_NO_AC`, `REQ_NO_AC`, `DEC_UNUSED`, `AC_NO_REQ`, `AC_REQ_LEVEL`, `REQ_NO_DEC`) become consistency lines at the gate.
   Max 3 loops for steps 2–3; then show the remaining errors.

## 6. GATE (quiz)
```
_Summary:_ changes/<id>/tasks.md — <n> tasks (<h> high, <l> low) · spec: <status> · design: <status|skipped>

| id   | title                         | prio | risk (reasons)        | impl   | blocked-by |
|------|-------------------------------|------|-----------------------|--------|------------|
| PWR-T11 | Extract PasswordHasher        | P0   | low                   | agent  | —          |
| PWR-T12 | Register user (unique email)  | P1   | high (security, api)  | mixed  | PWR-T11       |

_Test plan:_ <n> new tests (budget <n+2 per task>) · <s> shared · <c> covered · <x> none · <m> manual
| task    | AC  | test                                        | seam                   |
|---------|-----|---------------------------------------------|------------------------|
| PWR-T12 | AC1 | new: a duplicate in another case is saved   | UserService.createUser |
| PWR-T12 | AC2 | shared: AC1                                 | —                      |

<update only: new: <ids> · edited: <ids (what)> · drop after Y: <ids (reason)> · superseded: <AC → AC>>
<consistency lines: trace warn/info (one line per code: ids) + semantic checks from slicing-and-risk.md §8, if any>
1. Granularity ok?  2. Blocking edges right?  3. Merge/split?  4. Owners (agent/manual) ok?
5. Test plan ok? (new tests and the defect each catches, shared/covered/none/manual, seams)
— reply changes, or Y
```
END THE TURN. On changes: edit, re-run step 5, show the gate again. On Y: run `hitl-index tasks drop <T> --reason
"<reason>"` for each listed drop and re-run step 5; set the header `> status: approved` (this header line only; never
task `status:` fields or boxes) and print:
- `✅ Tasks approved.`
- `_Next:_` first frontier task — high risk → `/hitl:skeleton <T>`; low risk → `/hitl:implement <T>` (_Fast_ lane).
- Ticket tracker (optional, fail-open): `hitl-index tickets status --json`. If `enabled && configured && autoPush.onTasksApproved`
  → invoke the Skill `hitl:tickets` with `push <change-id> --auto`. Its output is informational; never change this
  skill's result because of it (error or missing command → skip silently).

## Rules
- Write only the tasks file. Signatures belong to `/hitl:skeleton`, not here.
- Never edit task `status:` values or `[ ]/[x]` boxes of existing tasks (tooling owns them).
- No effort estimates, story points or scores.

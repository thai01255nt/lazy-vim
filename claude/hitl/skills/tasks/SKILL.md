---
name: tasks
description: Breaks an approved hitl change into prioritized vertical-slice tasks (risk, acceptance criteria → spec scenarios, target symbols, test plan) in tasks.md, reviewed and approved in a tasks brief file the user answers in the editor. Use after /hitl:design or /hitl:plan, or for "tasks", "break down", "chia task", "tạo task", "tasks quick", "task nhanh", or when /hitl:go routes here. Not for a bare description of new work without a task ask (/hitl:go).
argument-hint: "[<change-id> [update [<what>]] | <QKEY> | quick <description>]"
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
  `hitl-index next-id --quick <slug> --json` → `{next: "QFLT-T1", key: "QFLT"}` (a fresh key per quick file, no gate;
  a slug ending in `-brief` is refused, `QUICK_SLUG_RESERVED`: pick another); header `← Change: none | key: <key>`; ACs
  `<key>-T1.AC<k>`. Never `QT` (legacy). Its brief: `.hitl/tasks/quick-<slug>-brief.md`, meta `> quick: <slug> | key: <key>`.
- `<change-id>`, a quick key (`QFLT`) or `quick-<slug>` (resolved in this order) → that set; with an open tasks brief
  (or "continue", "tiếp", "xong" in this conversation) → **§6 Run** on the answered brief.
- Else the change id = the one used in this conversation, else `hitl-index change --json` and the active
  changes in phase `tasks` (or matching the user's words). Several → GATE `Use which change? (1/2/…)` END THE TURN.
- None → `_Stop:_ No change. Run /hitl:plan first.` Stop. A v0.5 planning file name → `_Stop:_ v0.5 planning — migrate first
  (/hitl:plan offers it, or hitl-index migrate --specs).` Stop.
- Proposal `status: draft` → `⚠️ Spec is still draft (open questions: <n>).` Design `draft` → `⚠️ Design is still draft.`
  Design `missing` and not skipped → `⚠️ No design yet (_Tip:_ /hitl:design <id>).` Continue; each becomes a `_Warn:_`
  line of the round.
- **One open brief writes tasks.md**: an open amend brief of the change (`hitl-index brief <id> --kind amend --json`,
  status not done) → write no tasks round: add `<what>` (or the user's words) as a `>` line to the Notes of the amend
  brief's open round, print `Added to the Notes of <amend brief> (the amend brief holds this change's task set).` and
  END THE TURN. Amend task sets stay in the amend brief (`shared/amend-spec.md` §4.4).
- Target = `.hitl/changes/<id>/tasks.md` (quick: the quick file). It exists →
  - header `draft`, no tasks brief (a set written before 0.21) → write round 1 of the brief for the set as it is (§5
    steps 2–4); no redraft.
  - header `approved` → **update** (no question; there is no overwrite). First `hitl-index tasks baseline <id|KEY>`
    (records the approved set before you edit; refused while a round is open: then continue that round), then edit,
    then rewrite the brief as round n+1 with a `_Update:_ <what>` line (header `status: open`).
    The header stays `approved`; only the new and edited tasks are held (`TASKS_NOT_APPROVED`) until the approve Y.
  - **Cheap late edits** (no update, no round, nothing held): on an approved set, a todo task's `prio`, `blocked-by` or
    its place in the file may change at any time, by the human or by you (say it in one chat line). Its `risk`: the
    human may change it; you may raise it, never lower it or drop a reason (the hook refuses, `TASKS_RISK_LOWERED`:
    ask the human to edit tasks.md). Adding or dropping tasks, ACs, symbols or the test plan → an update.
  `<change-id> update [<what>]` (from `/hitl:go`, a note's apply command or an amend route) is the same; `<what>` is the
  work to add. While a round of the tasks brief is open, `<what>` goes into the Notes of that round instead (then §6 Run).
  Update rules (`shared/task-changes.md`):
  - keep existing task ids, statuses and checkboxes; never renumber or reuse an id;
  - per task state: a `todo` task is edited in place, or dropped (listed `drop after Y`; `hitl-index tasks drop` runs
    only right before `tasks approve`, §6); an in-progress task is edited in place (a new scenario on its requirement →
    a new AC, next AC number; its locked tests reopen only through `/hitl:approve <id> reopen`); a **done** task is
    never edited: new work on its code or behaviour is a new task (it names the symbols `modify`/`remove`, takes over
    old-behaviour tests with `rewrite:` rows, and the done task's stale ACs get `superseded:` lines, task-changes.md §2);
  - a change of approved behaviour or design is not an update: `/hitl:plan <id> amend` (`shared/amend-spec.md`);
  - a full re-slice while every task is still `todo`: drop the old tasks and add new ones — the round lists both, the
    drops run after the approve Y (task-changes.md §6).
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
prio P0–P3, risk with reasons, 2–6 ACs `<KEY>-T<n>.AC<k>`, symbols with owner (callers before or after callees is fine: implement order is computed from `@calls`, row order breaks ties), a test-plan row per AC with its test decision (`new: <defect>` · `shared: <ACk>` · `covered: <test>` · `none: <reason>` · `manual: <check>`, `slicing-and-risk.md` §7; `none!:`/`manual!:` only after the human's own Y, §6).
- Tasks come from the **scenarios** (behaviour) sliced along the design's **components** (where it lives).
- Each AC carries the scenario it instantiates right after its id: `- [ ] PWR-T12.AC1 (PWR-R3.S1) Given … When … Then …`.
  Only ADDED/MODIFIED (or living, for a regression AC) ids of the change's view. A requirement-level ref `(PWR-R3)` is
  allowed but gives `AC_REQ_LEVEL` info; prefer the scenario. Several refs: `(PWR-R3.S1, SGN-BR1)` (spec ids carry the key of the change that created them).
- `**Why**` cites the design decisions it implements: `… (PWR-D1, PWR-D2)`. No design (skipped) → cite the requirement ids.
- Symbols (`### Symbols`) are the first place code names appear: they belong here, not in the spec or design.
- Quick mode: one task, no spec refs, no `<KEY>-D<n>`; risk per the rules; high or too big → a "Needs your eye" bullet
  recommends `/hitl:plan <description>` (a Y there prints that command; you never start it).
  A trivial change (wording, constant, log line) usually gets `none: <reason>` or `covered: <test>` instead of a new test.

## 5. Write and validate (loop until clean)
1. Write the file: header (`# <Title> Tasks`, `← Change: <id>` — quick: `← Change: none | key: <key>` — `> status: draft`), then tasks sorted by prio.
   Never write `> status: approved`: only `hitl-index tasks approve` sets it (the hook refuses your edit). An update
   keeps the header as it is.
   Meta line exactly: `- prio: P1 | risk: high (security, public-api) | impl: mixed | blocked-by: PWR-T11 | status: todo`
   (`blocked-by: none` when empty; a task of another change is named by its own id, e.g. `FEE-T2`; new tasks start `status: todo`; boxes `[ ]`).
   An amend task (amend-spec.md §4.4) adds `| amend: PWR-A1 | kind: switch` before `| status:` (task-changes.md §3).
   Merged or released old behaviour (0.18): write the set with the patterns of
   `${CLAUDE_PLUGIN_ROOT}/shared/formats/parallel-change.md` (schema or stored data, API, feature flag, event format):
   `| deploy: <n>` after `kind:`, a `**Temp**: <name> (data|api|event|flag|shim) — <what>` line per temporary item under
   the meta line of the task that adds it, `**Removes**: <name>, …` on the contract task that removes them; migrate tasks
   test on a copy of real-shaped data, contract tasks have `remove` rows and a test that the old path is gone.
   Update: write only the new and edited tasks; a task you plan to drop stays as it is until the approve Y (its check errors are expected).
2. `hitl-index tasks --check --json`. Fix every error (duplicate ids, unknown blocked-by, missing meta, `modify` target missing,
   `new` symbol already exists, AC without test-plan row, test-plan codes `TEST_PLAN_BAD|NO_DEFECT|EMPTY|SHARED|COVERED|NONE_RISK|OVERRIDE_NO_REASON`
   (`NONE_RISK`: an automated test, or the human's override in the brief, never `!` on your own, `slicing-and-risk.md` §7;
   `OVERRIDE_NO_REASON`: ask the human for the reason, never invent it),
   bad ref form, unknown/removed scenario or requirement, unknown `<KEY>-D<n>`,
   `TASK_KEY_MISMATCH`, `QUICK_KEY_TAKEN` → a fresh `next-id --quick <slug>` key in the header and the ids; 0.17:
   `TASK_KIND_BAD`, `AMEND_KEY_MISMATCH`, `TASK_DROPPED_*`, `SUPERSEDED_UNKNOWN`, `REMOVE_STILL_PRESENT`, `AMEND_ORDER`,
   `AMEND_UNCOVERED` (0.18: also each caller of a changed symbol), `AMEND_TEMP_NO_REMOVAL`, `AMEND_CONTRACT_SAME_DEPLOY`,
   task-changes.md §5) and re-run. `warnings` (`TEST_PLAN_NONE_RISK_OVERRIDE`) and `info` (`TEST_OVERRIDE_UNRECORDED`: a
   `!` row without its answered override) are not errors.
3. Not quick: `hitl-index trace <change-id> --json`. Fix every `block` item (`REQ_UNKNOWN`, `SCN_UNKNOWN`,
   `RULE_UNKNOWN`, `REQ_INACTIVE`, `DEC_UNKNOWN`, `CHANGE_MISSING`, …) in the same loop, and the `warn`/`info` items
   (`SCN_NO_AC`, `REQ_NO_AC`, `DEC_UNUSED`, `AC_NO_REQ`, `AC_REQ_LEVEL`, `REQ_NO_DEC`) and the semantic checks of
   `slicing-and-risk.md` §8 too. Only a finding that needs the human's choice goes to the brief (§6). The
   test-progress codes (`AC_NO_TEST`, `AC_ONLY_STUB`, `AC_NOT_PROVEN`, `AC_NO_TEST_BY_DECISION`, `AC_MANUAL_CHECK`,
   `AC_TEST_OVERRIDE`, `TEST_OVERRIDE_UNRECORDED`) describe later stages: never in the brief.
   Max 3 loops for steps 2–3; then the remaining errors go into the brief as `_Warn:_` lines.
4. Write the brief (§6) from `${CLAUDE_PLUGIN_ROOT}/shared/templates/tasks-brief.md` (change:
   `.hitl/changes/<id>/tasks-brief.md`; quick: `.hitl/tasks/quick-<slug>-brief.md`, meta `quick:` instead of
   `change:`) — then, last, `hitl-index tasks gate <id|KEY> --write`: it writes `## Tasks (N) — in build order` (a
   table, one row per task, generated from tasks.md; its `Why` column is the task's `**Why**:` line), the `set:` meta
   and the round snapshot. Never write that list by hand,
   never change tasks.md after this call in the same run.

## 6. The tasks brief (the gate)
The brief is a short list the human reads, not an interview; it is rewritten each round (the header's `round:` counts
up). A Y typed in chat is not an answer: reply `Answer Y under "Approve?" in <brief>, then /hitl:tasks <id|KEY>.`
(one line). Answer grammar, marks and `_Disc:_`: `${CLAUDE_PLUGIN_ROOT}/shared/interview.md` §4–§6. In this order:
- the header (`round`, `status: open`, `updated`, the `next:` line);
- only when any: `_Changed since Round <n>:_` — the lines of `hitl-index tasks diff <id|KEY> --json` (run before
  `tasks gate --write`) joined by ` · `, `(your edit)` after the human's own; `_Update:_ <what>`; `_Warn:_` lines
  (spec or design still draft, no design yet, loop leftovers);
- `## Tasks (N) — in build order`: from `tasks gate --write` only;
- `## Needs your eye` — only when there is something, else leave it out. One plain bullet each, at most two short
  sentences (the ask first): a finding that needs the human's choice, your real doubt (a task too large, an unclear
  owner, quick too big → `/hitl:plan`), with a `>` line under the bullet when it needs an answer. Never a review question for its own sake, never a test-progress code.
  A test override: one bullet per AC, `` - Override: <AC> `none!: <reason>`? (needs its own Y) `` (or `manual!: <check> —
  <reason>`, `slicing-and-risk.md` §7) and its own `>` line. An override answered Y in an earlier round stays, marked.
- `## Notes — change risk, order, prio, add/drop/merge tasks` and `>`;
- `## Approve? (needs its own Y)` and `>`.
Chat: at most 3 lines (`Round <n>: <N> tasks in <brief path>`, the command). END THE TURN.

### Run on an answered brief (`/hitl:tasks <id|KEY>`, "tiếp", "xong")
1. `hitl-index brief <id|KEY> --kind tasks --json` and `hitl-index tasks diff <id|KEY> --json`.
2. Nothing answered (`counts.answered` 0), no pending Notes and `diff.changed` false → `Round <n> in <file> has no
   answers yet.` END THE TURN.
3. `diff.lines` are the human's own edits of tasks.md since the round: they are answers. Keep them (never revert),
   validate them with §5; one that breaks a check → a "Needs your eye" bullet with `_Disc:_` in the next round.
4. Override answered Y → write its `!` row with the reason from the bullet, mark `→ recorded: <AC> none!`; a bare `n`
   → `→ recorded: declined`; empty → it stays (the row keeps an automated test).
5. Notes and the other bullets: interview.md §6 (a question or doubt → `_Disc:_` under a bullet of the next round).
   An answer that changes the set → edit tasks.md now (drops stay `drop after Y`).
6. Re-run §5 steps 2–3.
7. `Approve?` has `Y` under itself and this run changed nothing in the set except the overrides' `!` rows (on an
   approved set, prio, risk and blocked-by edits do not count) → `hitl-index tasks drop <T> --reason "<reason>"` for each
   listed drop, then `hitl-index tasks approve <id|KEY> --json` (sets the header `> status: approved`, marks
   `→ approved <date>`, the brief `status: done`). Then print:
   - `✅ Tasks approved.`
   - `_Next:_` first frontier task — high risk → `/hitl:skeleton <T>`; low risk → `/hitl:implement <T>` (_Fast_ lane).
   - Ticket tracker (optional, fail-open): `hitl-index tickets status --json`. If `enabled && configured && autoPush.onTasksApproved`
     → invoke the Skill `hitl:tickets` with `push <change-id> --auto`. Its output is informational; never change this
     skill's result because of it (error or missing command → skip silently).
   Refused `TASKS_SET_CHANGED` (the set differs from the round's snapshot) → step 8; another refusal → its message as
   a `_Warn:_` line of the next round.
8. Otherwise rewrite the brief as round n+1 (§6, the `_Changed since Round <n>:_` line first; a Y the set no longer
   matches is gone with the old round) and `hitl-index tasks gate <id|KEY> --write`. END THE TURN.

## Rules
- Write only the tasks file and its tasks brief. Signatures belong to `/hitl:skeleton`, not here. The header
  `> status: approved`, `## Tasks (N)`, `set:` and the snapshot are the CLI's.
- Never edit task `status:` values or `[ ]/[x]` boxes of existing tasks (tooling owns them).
- No effort estimates, story points or scores.

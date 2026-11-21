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
    then append `## Round <n> — update: <what>` to the same brief (rounds keep their numbers; header `status: open`).
    The header stays `approved`; only the new and edited tasks are held (`TASKS_NOT_APPROVED`) until the approve Y.
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
- Quick mode: one task, no spec refs, no `<KEY>-D<n>`; risk per the rules; high → Q1 of the brief recommends `/hitl:plan`.
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
   (`NONE_RISK`: an automated test, or the human's `_Override:_` question in the brief, never `!` on your own, `slicing-and-risk.md` §7;
   `OVERRIDE_NO_REASON`: ask the human for the reason, never invent it),
   bad ref form, unknown/removed scenario or requirement, unknown `<KEY>-D<n>`,
   `TASK_KEY_MISMATCH`, `QUICK_KEY_TAKEN` → a fresh `next-id --quick <slug>` key in the header and the ids; 0.17:
   `TASK_KIND_BAD`, `AMEND_KEY_MISMATCH`, `TASK_DROPPED_*`, `SUPERSEDED_UNKNOWN`, `REMOVE_STILL_PRESENT`, `AMEND_ORDER`,
   `AMEND_UNCOVERED` (0.18: also each caller of a changed symbol), `AMEND_TEMP_NO_REMOVAL`, `AMEND_CONTRACT_SAME_DEPLOY`,
   task-changes.md §5) and re-run. `warnings` (`TEST_PLAN_NONE_RISK_OVERRIDE`) and `info` (`TEST_OVERRIDE_UNRECORDED`: a
   `!` row without its answered `_Override:_` question) are not errors.
3. Not quick: `hitl-index trace <change-id> --json`. Fix every `block` item (`REQ_UNKNOWN`, `SCN_UNKNOWN`,
   `RULE_UNKNOWN`, `REQ_INACTIVE`, `DEC_UNKNOWN`, `CHANGE_MISSING`, …) in the same loop. `warn`/`info` items
   (`SCN_NO_AC`, `REQ_NO_AC`, `DEC_UNUSED`, `AC_NO_REQ`, `AC_REQ_LEVEL`, `REQ_NO_DEC`) become `[C]` questions (§6);
   the test-progress codes (`AC_NO_TEST`, `AC_ONLY_STUB`, `AC_NOT_PROVEN`, `AC_NO_TEST_BY_DECISION`, `AC_MANUAL_CHECK`,
   `AC_TEST_OVERRIDE`, `TEST_OVERRIDE_UNRECORDED`) describe later stages and never become questions.
   Max 3 loops for steps 2–3; then the remaining errors go into the round as `_Warn:_` lines. Fix what you are sure
   of before the round: a recommendation that changes the set costs the human one more round.
4. Write the round into the tasks brief (§6) — a new brief from `${CLAUDE_PLUGIN_ROOT}/shared/templates/tasks-brief.md`
   (change: `.hitl/changes/<id>/tasks-brief.md`; quick: `.hitl/tasks/quick-<slug>-brief.md`, meta `quick:` instead of
   `change:`) — then, last, `hitl-index tasks gate <id|KEY> --write`: it writes `## Current set` (summary, the task
   table with the wave column, the test-plan table, all generated from tasks.md), the `set:` meta and the round
   snapshot. Never copy those tables by hand, never change tasks.md after this call in the same run.

## 6. The tasks brief (the gate)
The review of the set happens in the brief file, never in chat (`${CLAUDE_PLUGIN_ROOT}/shared/interview.md` §4–§6:
answer grammar, accept-all, `(needs its own Y)`, marks, `_Disc:_`, Notes). A Y typed in chat is not an answer: reply
`Answer Y under "Approve the task set?" in <brief>, then /hitl:tasks <id|KEY>.` (one line).
A round (questions and evidence: `references/slicing-and-risk.md` §8–§9), in this order:
- round ≥ 2 and update rounds: `_Changed since Round <n>:_` — the lines of `hitl-index tasks diff <id|KEY> --json`
  (run before `tasks gate --write`), joined by ` · `, your edit's reason after a line if useful; never from memory.
- `_Warn:_` lines (spec or design still draft, no design yet, loop leftovers), then the accept-all line.
- `[Q]` Q1 slices · Q2 blocking edges · Q3 owners · Q4 test plan (first round and every round they reopen): each with
  your own check as evidence and a `_Rec:_` (`keep as drafted`, or the concrete edit plus `(changes the set)`).
  One task (quick): Q1 says `merge: — (1 task)` and keeps the split check (too big or high risk → `_Rec:_ move to
  /hitl:plan <description>`; a Y prints that command, you never start it); Q2 is written settled (`— (1 task)`,
  `→ recorded: n/a (1 task)`) unless the task waits for a task of a change. Same numbers in both kinds.
- `[C]` one question per finding code, its ids grouped (trace warn/info, the §8 semantic checks): `_Rec:_ fix: …
  (changes the set)` or `accept: <reason>`.
- `### Q<n> _Override:_ <AC> none!: <reason>? (needs its own Y)` per AC (slicing-and-risk.md §7).
- the Notes block, then last `### Q<n> Approve the task set? (Y/n) (needs its own Y)`. Neither the accept-all Y nor a
  chat Y answers it or an `_Override:_` question.
≤ 7 `[Q]`/`[C]` questions per round (overflow → the next round, blocking first). Header: `round`, `status: open`,
`updated`. Chat: at most 3 lines (`Round <n>: <k> questions in <brief path>`, the command). END THE TURN.

### Run on an answered brief (`/hitl:tasks <id|KEY>`, "tiếp", "xong")
1. `hitl-index brief <id|KEY> --kind tasks --json` and `hitl-index tasks diff <id|KEY> --json`.
2. Nothing answered (`counts.answered` 0), no pending Notes and `diff.changed` false → `Round <n> in <file> has no
   answers yet.` END THE TURN.
3. `diff.lines` are the human's own edits of tasks.md since the round: they are answers. Keep them (never revert),
   validate them with §5, list them in the next `_Changed since …_` line with `(your edit)`; one that breaks a check →
   a question with `_Disc:_` in the next round. They change the set, so they supersede an approve Y (step 7).
4. `_Override:_` answered Y → write its `!` row with the reason from the question, mark `→ recorded: <AC> none!`; a
   bare `n` → `→ recorded: declined`; empty → carried (the row keeps an automated test).
5. `[Q]`/`[C]` answers, accept-all and Notes: interview.md §6 (marks, `_Disc:_`, carried). An answer or an accepted
   `_Rec:_` that changes the set → edit tasks.md now (drops stay `drop after Y`).
6. Re-run §5 steps 2–3.
7. The approve question has `Y` under itself, every other question of the round is marked, and this run changed
   nothing in the set except this round's `_Override:_` `!` rows → `hitl-index tasks drop <T> --reason "<reason>"` for
   each listed drop, then `hitl-index tasks approve <id|KEY> --json` (it sets the header `> status: approved`, marks the
   approve question `→ approved <date>`, the round ✅ and the brief `status: done`). Then print:
   - `✅ Tasks approved.`
   - `_Next:_` first frontier task — high risk → `/hitl:skeleton <T>`; low risk → `/hitl:implement <T>` (_Fast_ lane).
   - Ticket tracker (optional, fail-open): `hitl-index tickets status --json`. If `enabled && configured && autoPush.onTasksApproved`
     → invoke the Skill `hitl:tickets` with `push <change-id> --auto`. Its output is informational; never change this
     skill's result because of it (error or missing command → skip silently).
   Refused `TASKS_SET_CHANGED` (the set differs from the round's snapshot) → step 8 with `→ superseded`; another
   refusal → its message as a `_Warn:_` line of the next round.
8. Otherwise mark the approve question (`→ superseded` when it had a Y the set no longer matches; empty →
   `→ carried to Round <n+1>`; `n` + text → an answer, step 5), ✅ on the round, then write round n+1 as in §6 (the
   `_Changed since Round <n>:_` line first) and `hitl-index tasks gate <id|KEY> --write`. END THE TURN.

## Rules
- Write only the tasks file and its tasks brief. Signatures belong to `/hitl:skeleton`, not here. The header
  `> status: approved`, `## Current set`, `set:` and the snapshot are the CLI's.
- Never edit task `status:` values or `[ ]/[x]` boxes of existing tasks (tooling owns them).
- No effort estimates, story points or scores.

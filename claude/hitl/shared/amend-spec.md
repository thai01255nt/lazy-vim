# Amend an approved spec or design (shared procedure, v4 — 0.17)

Used by `/hitl:plan <change-id> amend [N-k]`, `/hitl:design <change-id> amend [N-k]` (and `_Needs spec:_` in a design
brief, §3), `/hitl:sync` (option 4), `/hitl:review` (`amend F-n`) and `/hitl:implement` (spec change proposal, option
1). Purpose: when approved behaviour or an approved design must change, record *what* and *why* in the change (spec
delta, superseded decision, Changelog), and turn it into an ordered set of tasks, instead of letting code and spec
silently diverge. What it does to locked work is listed in the Impact block and unlocked only by the human's
`/hitl:approve <id> reopen`.

Terms: **amendment** — one change to an approved spec delta or design of an active change, id `<KEY>-A<n>`
(`hitl-index spec next-id <id> --kind A`); **amend brief** — `.hitl/changes/<id>/amend-<KEY>-A<n>-brief.md`, the
interview and the record of one amendment; **amend task set** — the tasks it adds or changes (`shared/task-changes.md`).

Ideas adapted (no code): OpenSpec delta specs (ADDED/MODIFIED/REMOVED), Nygard ADR supersede rule, BMAD "correct
course" (impact → path → one approval). See NOTICE.md.

## 1. Route (deterministic: `hitl-index amend start`)

Not an amendment: a proposal or design still `draft` (edit it in its plan or design brief, interview.md §6) and an
implementation detail that changes no requirement, scenario or decision (plain accept). Otherwise:
1. Collect the refs: the note's refs (`--from N-k`, `hitl-index note show --change <id> N-k --json`), or the ids the
   request names (spec ids, `<KEY>-D<n>`, task or AC ids, symbols; `hitl-index spec show`, `trace`).
2. Propose one Impact class per spec or decision id (§2 table; your judgement, the human confirms it later).
3. `hitl-index amend start <id> [--from N-k[,N-m]] [--refs a,b] [--impact "<id>=<class>,…"] --json` → `route`:

| route | when | then |
| --- | --- | --- |
| `chat` · `gate` | every spec or decision id has class `wording` | the one-gate chat flow (§2) |
| `chat` · `tasks-update` | only task-level ids (task, AC, symbol, test), no class above wording | `/hitl:tasks <id> update <what>` (quiz gate, per-state rules of task-changes.md) |
| `chat` · `mini-change` | the change is archived | §6 |
| `brief` | anything else: a behaviour, contract, scenario or requirement change; a task-level id with a behaviour class (a spec gap); no ids yet; an amend brief of the change is already open | the amend brief (§4) |

One amend brief may be open per change; while it is open, every new amendment of that change goes into it (as Notes of
its open round, interview.md §6), and `/hitl:plan <id>` or `/hitl:design <id>` continues it.

## 2. The chat gate (route `chat · gate`, and the callers' quick path)

Draft the delta, then show in one gate turn (never write first): the delta preview, **then** the Impact block, **then**
the question.
```
_Delta:_ Spec delta — change feat-password-reset (active)
  ~ ACC-R3.S2  THEN "same confirmation" → THEN "the same confirmation message"     (specs/accounts/spec.md, MODIFIED)
  ~ tasks.md PWR-T12.AC2 text → "…"                                                  (text and ref group only)
_Impact:_ (human confirms the classes)
  ACC-R3.S2  wording   → nothing reopens
  Total: reopens 0 tests in 0 tasks
Apply? (Y/n/edit)
```
Impact: `hitl-index note apply --change <id> [N-k] --impact "<id>=<class>,…" --dry-run --json`, one line per id.

| class | when | reopens |
| --- | --- | --- |
| wording | same behaviour, clearer words | nothing |
| behaviour | WHEN/THEN, a number, a removed scenario | the locked tests whose AC maps to it |
| contract | a contract decision, a signature or intent, a new error | the skeleton symbols named through `@dec`/covers, plus their tests |
| scenario | a new scenario on a requirement a task covers | a new AC; its tests |
| requirement | a new requirement | nothing; new tasks |

- When unsure between wording and behaviour, pick behaviour. Name the AC and test titles so the human can judge.
- The human may change a class with `edit <id>=<class>`; re-run the dry run. A class above wording → the change goes
  to the amend brief (§4): say so in one line and continue there.
- GATE: END THE TURN after `Apply? (Y/n/edit)`. `Y` → §5 rules, `note apply` without `--dry-run`, §7.
- `/hitl:design`'s `_Needs spec:_` (a design brief, design still draft): the delta preview and the Impact block are the
  body of `### Q<n> _Needs spec:_ <behaviour> (needs its own Y)` in the design brief instead of a chat gate
  (interview.md §8); its own `Y` applies it, a bare `n` writes nothing (`→ recorded: declined`).
- Callers in the middle of a task (`/hitl:sync`, `/hitl:review amend F-n`, `/hitl:implement` option 1): run §1. Route
  `chat · gate` → this gate in their turn. Route `brief` → `amend start … --write`, append Round 1 (§4.1), print
  `_Next:_ answer <file>, then /hitl:plan <id> amend` and stop there (the finding stays open, the implement loop stops).

## 3. The amend brief: format

Template `${CLAUDE_PLUGIN_ROOT}/shared/templates/amend-brief.md`; round format, answer grammar, accept-all line and
Notes as in `shared/interview.md` §4–§6. Header:
`> change | key | kind: amend | amend: <KEY>-A<n> | from: N-k, … | refs: <ids> | transition: — | skill: plan|design | status | round | updated`
- `refs:` — every spec, decision, task, AC or symbol id the amendment changes so far. The CLI computes from it the
  tasks the amendment touches (the hold, §4.5) and the items it must cover (`AMEND_UNCOVERED`); keep it current when
  a round adds or removes an id.
- `transition:` — `branch`, `merged` or `released`, once the transition question is answered (task-changes.md §3).
- `skill:` — the command that processes it (`plan` for a requirement change, `design` for a design note).
- `## Where the change stands` and `## Affected` — written by `amend start --write` (facts, never questions):
  every task with its status, locks, the per-state rule that applies, and the refs that touch it; the specs,
  decisions, ACs, symbols and locked tests the refs reach by the traceability links (AC refs, `**Why**`, `@dec`,
  locked tests and what they cover) — also tests a task of an archived change locked — and the open notes.
- `## Unchanged` — written by Claude at Close: one line per affected item the amendment does not change,
  `- <id or test title> — <reason>`. It is the only way to leave an affected item without a task.

Question tags: `[R]` (what changes, business words), `[D]` (how, may name code; the transition question), and two
amend tags:
- `[X]` — one per out-of-scope candidate: "accept into this change's scope? · own change (`--before` or after) · drop".
  `_Rec:_` by the size rule of `other-changes.md` §1 (small → accept; big → own change). Accept → it becomes part of
  this amendment; own change → print the `/hitl:go <X> --before <id>` hint (a note or a new change only on the user's
  typed command); drop → one line in the proposal's `## Out of scope`.
- `[K]` — one per half-done task (skeleton or tests locked, or code, not done): "keep and adapt · revert to the base
  and redo". `_Rec:_` keep, unless the work contradicts the new behaviour throughout. Revert → a `revert` task.

## 4. The amend brief: the runs

### 4.1 Start (route `brief`)
1. `hitl-index amend start <id> --from … --refs … --impact … --skill plan|design --write --json` writes the file with
   the header and the facts. Read it.
2. Append `## Round 1` (template): the accept-all line; Part 1 **What** first — `[R]` questions on the change itself and
   its edges (neighbour scenarios of the same requirement, the open notes), business words only; then the transition
   question `[D]`; one `[X]` per out-of-scope candidate; one `[K]` per half-done task. Part 2 **How** (`[D]` per hit
   decision: supersede or keep; contracts, data) starts in round 1 only for a pure design amendment, else once Part 1's
   questions are settled. ≤ 7 questions per round (interview.md §4 caps), every one with `_Rec:_`, the Notes block last.
3. Chat ≤ 3 lines: `Amend brief ready: <file> — answer in the file, then /hitl:<skill> <id> amend`. END THE TURN.

### 4.2 Later runs
`/hitl:plan <id> amend` (or `/hitl:design <id> amend`, or `/hitl:plan <id>` / `/hitl:design <id>` while the brief is
open). `hitl-index brief <id> --kind amend --json`; process per interview.md §6. **Nothing is written to the delta,
design.md, the proposal or tasks.md before the approval** (§4.4): a settled answer is marked
`→ recorded: settled (applies at approval)`, and the header's `refs:` / `transition:` are updated. Next round, or Close
when every question is settled.

### 4.3 Close
Append `## Unchanged` (if any) and `## Close`, header `status: closing`:
```
## Close

_Delta:_ ~ PWR-R3.S2 THEN "valid for 1 hour" → THEN "valid for 15 minutes" (MODIFIED) · ~ PWR-D2 → superseded by PWR-D5

_Impact:_ PWR-R3.S2 behaviour → PWR-T13 tests (PWR-T13.AC3) · PWR-T12 done: kept (PWR-T15 takes over 1 test) · PWR-D2 contract → PWR-T13 skeleton ResetService.verify

_Amend set:_ PWR-A1 — 3 tasks · transition: branch · order: switch → contract

| #   | task    | kind     | rule              | title                                 | what                                                                     |
| --- | ------- | -------- | ----------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| 1   | PWR-T15 | switch   | new               | Expire reset links after 15 minutes   | modify ResetService.request (done in PWR-T12) · rewrite: PWR-T12.AC2     |
| 2   | PWR-T13 | switch   | reopen in place   | Reset with a valid link               | AC3 text · TODO steps refreshed · blocked-by PWR-T15                     |
| 3   | PWR-T16 | contract | new               | Remove the hourly sweep of old links  | remove ResetJob.sweep · blocked-by PWR-T15                               |

dropped: none · superseded: PWR-T12.AC2 → PWR-T15.AC1 · out of scope: "limit reset requests" → own change (Q3)

### Notes — anything the questions missed, or a change to an earlier answer

>

### Approve the amendment? (Y/n) (needs its own Y)

>
```
- The Impact line comes from `note apply --change <id> --impact … --dry-run --json` (done tasks are kept once the
  task set carries the amendment; the take-overs are the `rewrite:` rows of the drafted set).
- The amend set follows task-changes.md: the rule per task state, the kinds and their order for the transition answer,
  `remove` rows with evidence (a symbol that exists now), `superseded:` lines, dropped tasks with a reason.
- Chat: `<file>: ready to approve — answer the Close section, then /hitl:<skill> <id> amend`. END THE TURN.
- Next run, in the order of interview.md §9: pending Close Notes (a change → `→ superseded` and a new Close), then the
  last question. Only a `Y` under it approves (the round's accept-all line never does).

### 4.4 Approve (`Y` under the Close question)
In one run, in this order:
1. The delta, design.md (superseded rows, new D rows, Changelog, `updated:`), the proposal (`updated:`, Capabilities
   ids), `@dec` tag lines on the affected code symbols (`@dec` is not hashed: no re-approval), per §5.
2. tasks.md per task-changes.md: edits in place (todo and in-progress tasks get `amend: <KEY>-A<n>` and, if they belong
   to the ordered set, a `kind:`), new tasks (`hitl-index next-id <id>`, `amend:` + `kind:` meta, `blocked-by` in the
   kind order), `superseded:` lines on done tasks' ACs, then `hitl-index tasks drop <T> --reason "…" --amend <KEY>-A<n>`
   for each dropped task. The tasks header keeps `status: approved` (this Y approves the set).
3. Validate: `hitl-index spec validate <id> --json`, `hitl-index tasks --check --json`, `hitl-index trace <id> --json`,
   `hitl-index amend check <id> --amend <KEY>-A<n> --json`. Fix every error and `block` item in the same run (max 3
   loops; an uncovered item → a task edit, or a `## Unchanged` line only when the human's answers said so).
4. Record: `hitl-index note apply --change <id> --amend <KEY>-A<n> --impact "<the confirmed classes>" --json`. It marks
   the brief's `from:` notes applied, keeps done tasks (never reopened), and, when an in-progress task has locked work
   or a `rewrite:` row names another task's locked test, writes a `recheck` note (`reopen pending`).
5. The brief: `→ approved <date>` under the question, header `status: done`. Print §7.

### 4.5 While the amend brief is open
Every task its `refs:` touch is **held**: `/hitl:implement` stops on it, the frontier skips it, the implementer hook
refuses its code, `hitl-index status --json` gives it `amendHold`. Untouched tasks keep moving. Open notes keep blocking
the approvals of the tasks they touch, as before.

## 5. Rules for the spec and design edits
- **Active change** → edit its delta `specs/<cap>/spec.md`:
  - an ADDED or MODIFIED block of this change → rewrite it in place (a MODIFIED block keeps an updated `Changed:` line);
  - a living requirement the change does not touch yet → add it under `## MODIFIED Requirements` as the **full** block
    (`hitl-index spec show <ID> --json`) with the edit and a `Changed:` line;
  - removing behaviour → `## REMOVED Requirements` + `Reason:`; new behaviour → `## ADDED` with ids from
    `hitl-index spec next-id <change-id> --kind R` / `--scenario <REQ-ID>`. Ids never change and are never reused.
- **Decisions are never edited in place** once the design is approved: the old row's status → `superseded by
  <KEY>-D<k>`, a new row is appended with `serves` and `alternatives` (`hitl-index spec next-id <id> --kind D`). One
  Changelog line per decision change in design.md `## Changelog`:
  `- <YYYY-MM-DD> <what> — <why> (source: <skill>, <KEY>-A<n>|<symbol>|F-n)`.
- Business files stay business-readable (no code names: `BIZ_CODE_TOKEN`).
- Never write `.hitl/specs/**`, `.hitl/archive/**`, `.base.json`, `notes.md` (only `hitl-index note`), the lock,
  `index/**`, `state.json`, review md, `<provider>.map.json`, `status:` fields or boxes.

## 6. Status of the proposal and the design (the one rule)
- An amendment never sets the proposal or design.md back to `draft`. While an amend brief is open they keep
  `status: approved` and do not change (nothing is written before its Y). On the Y under the amend brief's Close
  question they are edited and keep `status: approved`, `updated:` today: **that Y is the re-approval** of what the
  amendment changed, and the amend brief is its record. The same holds for the chat gate's `Y` (wording only) and for a
  `_Needs spec:_` question's own `Y` in a design brief.
- "Reopen the spec" / "reopen the design" (the second reply of the approved-spec gate of `/hitl:plan` §1 and the
  approved-design gate of `/hitl:design` §1) is allowed only while the change has no task in tasks.md: the proposal or
  design goes back to `draft` and its own brief gets a new round. Once a task exists, every change of approved
  behaviour or design is an amendment (§1).
- **Archived change, or a quick task** — living specs are never edited directly: a mini change `fix-<slug>` like any
  new change: its own change key (`hitl-index spec key fix-<slug>`, proposal meta `| key: <KEY>`), proposal + delta
  only (`## Artifacts` rows `design | skipped | spec-only amendment` and `tasks | skipped | spec-only amendment`),
  `hitl-index spec validate fix-<slug> --json`, `_Next:_ /hitl:archive fix-<slug>`.

## 7. Then
Print the commands the human types — an amendment never approves locked work itself:
- a recheck note was written → `_Note N-k_ waits for you → _Next:_ /hitl:approve <id> reopen N-k` (it reopens what the
  Impact block listed, moves the taken-over tests, or closes as "nothing to unlock"). Only the human runs it.
- otherwise → the first task of the amend set (`hitl-index status --json` `.next`).
- chat gate on a contract → `_Next:_ /hitl:approve <T> skeleton <symbols>`; a review finding → the review's decision flow.

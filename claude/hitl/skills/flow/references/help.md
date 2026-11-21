# /hitl:flow help block (print it for `help` or "how does the workflow work")

## Help

**hitl's value is the human in the loop during implementation.** The spec and design gates are cheap and always on:
agree on *what* (plan) and *how* (design) before any code. After that you choose how often to look:
- **Default, step by step**: every high-risk task stops at skeleton → tests → implement → review. You approve
  contracts before code exists.
- **Fast lane**: a low-risk task runs skeleton → tests → code without gates (`/hitl:implement <KEY>-T<n>`); on a
  high-risk task only when you type `--lane fast` (human override). You review the result.
- **Build then review** (`/hitl:implement --feature <change-id> --lane fast`, optionally after a design where you
  answered `Y` on each round's accept-all line):
  the whole change is built without gates, then one feature report lists everything to review and refine
  (`/hitl:review`, `fix F-n`, `amend F-n`). Locks, trace and drift still record everything, so nothing is silently
  unreviewed.
The spec gate (`/hitl:plan`) is never skipped. It is what the end-review checks against.
**Brief files** (0.14): `/hitl:plan` and `/hitl:design` interview you in a file, not in chat:
`.hitl/changes/<id>/plan-brief.md` / `design-brief.md`. Plan starts it with your description verbatim and round 1
(change id and key, ~10 core questions with an example each, a few tailored ones). Write your answers on the `>` lines
(as much as you like), then run `/hitl:plan <id>` (or `/hitl:design <id>`) again: Claude records them, writes `_Disc:_`
under any answer that was really a question, and appends the next round with a `_Rec:_` per question.
`Y` accepts one recommendation; `Y` on the round's accept-all line accepts all of the round you left empty, except
questions marked `(needs its own Y)` (a rename, a note into another change, a spec delta from design: only their own
`Y` counts). `n` + what you want instead is your answer, `n` + "later" postpones it, a bare `n` gets a `_Disc:_` asking
what instead. `?` / `không biết` keeps it open, `deep <ID>` digs deeper, `done` / `xong` stops asking. Until the
change has its first task you may rename its id or key and change its scope in any answer or Notes. Each round
(and `## Close`) ends with a **Notes** block: write there what the questions missed, or a change to an earlier answer (`Q5: …`); after the first run new information goes
there, not into Description. Approval is the last question of the file's `## Close`.
**Tasks brief** (0.21): `/hitl:tasks` writes tasks.md (draft), then reviews it with you in `tasks-brief.md` (a quick
file: `.hitl/tasks/quick-<slug>-brief.md`, continue with `/hitl:tasks <QKEY>`). `## Current set` above the round is
generated from tasks.md (task table with a **wave** column = dependency depth, test-plan table). Each round asks four
questions with Claude's own check and a `_Rec:_` (slices, blocking edges, owners, test plan), one per finding code,
one `_Override:_` per AC, Notes, and last `Approve the task set? (needs its own Y)`. You may also edit tasks.md
directly: the next run reads your edits as answers and lists them under `_Changed since Round n:_`. The approval
counts only when the set is still what the round showed; only `hitl-index tasks approve` sets `> status: approved`.
Until then `/hitl:skeleton`, `/hitl:implement` and `/hitl:test` refuse its tasks (`TASKS_NOT_APPROVED`); an update
holds only the tasks it adds or edits.
**Requirement changes mid-change** (0.9, amend brief 0.17): say it in chat and Claude asks `_Note_ for <change>, refs …?
(Y/n)`. The note blocks the approvals of the tasks it touches. Apply it with `/hitl:plan <id> amend N-k` (or
`/hitl:design … amend N-k`). Wording only → one chat gate (delta preview, Impact, `Apply?`); only task-level things →
`/hitl:tasks <id> update`; anything else → an **amend brief** `amend-<KEY>-A<n>-brief.md`: it starts with where each task
stands and what the change touches, asks what changes, whether the old behaviour is only in this branch, merged or
released, what to do with out-of-scope work (`[X]`) and with half-done tasks (`[K]`), and closes with the delta, the
Impact and the **amend task set** (new tasks marked `amend: <KEY>-A<n>`, `kind: prep|expand|migrate|switch|contract|revert`).
Its own `Y` applies it. While it is open, the tasks it touches are held (`_Held:_`); the others go on. A done task is
never reopened: a new task takes over its code and its old-behaviour tests (`rewrite:`), its old ACs get
`superseded:` lines. 0.18: the brief also lists the **callers** of every symbol the amendment changes or removes
(`### Reached through calls`, from the code index call graph; each one gets a task or a reason under `## Unchanged`);
when the old behaviour is merged or released, the set follows `shared/formats/parallel-change.md` (expand → migrate →
switch → contract, `**Temp**:` items each removed by a contract task, `deploy:` groups so a drop ships in a later
deploy). Docstrings state the current contract only: history wording ("previously", "no longer sends", "trước đây")
is the warning `INTENT_HISTORY` (opt-out `hitl: history-ok`). Only you unlock locked work: `/hitl:approve <id> reopen`. Escape hatches, also yours only:
`/hitl:approve <KEY>-T<n> <stage> --ack N-k`, `… <id> dismiss N-k <reason>`, `… <id> defer N-k <other-change>`.
**Two changes at once** (0.12): work that is too big for change A becomes its own change, created *before* A:
`/hitl:go <X> --before A` (several: `--before A,C`). A then waits: no task approval, implement or archive of A until the
new change is archived (A's plan, design and tasks stay open). While planning the new change, its effect on A goes into
A as a note (`source:`), never into A's files; after the new change is archived, A takes those notes in with
`/hitl:plan A amend N-k`. Planning also lists other active changes that share ids, files, contracts or terms
(`hitl-index overlap <id>`) and asks you what to do. Who goes first is your call; `/hitl:approve A dismiss N-k <reason>`
ends a wait. Check any time (e.g. after merging a branch): `/hitl:overlap A [B C …]` (0.13.1).
At any gate (`_Gate:_`), `?` / `wait` / `hả` / `giải thích` / `không hiểu` → Claude re-explains in plain words (glossary terms,
ids with titles) and asks the same question again.
**Shared language and refactor** (0.8.x): `spec validate` and the review's `terms` gate warn when a business file or an
intent uses a glossary `_Avoid_` word (`"user record" → use Account`). After green, the review lists **structure
suggestions** (duplication, names off the glossary, pass-through functions, deep nesting, tests of private helpers):
`fix F-n` runs a refactor pass under green, untouched tests. Never a blocker.

**Ids** (0.13): every change has a short key (2–5 capitals, e.g. `PWR`, chosen at `/hitl:plan`); every id starts
with the key of the change that created it: `PWR-R1`, `PWR-R1.S1`, `PWR-BR1`, `PWR-D1`, tasks `PWR-T3`, ACs `PWR-T3.AC2`
(a quick file has its own key, `QFLT-T1`). Upgrading from 0.12, or from 0.13.0–0.13.1 with `QT-T<n>` quick tasks: run
`/hitl:migrate` once.
**Id jump** (0.19): `hitl-index where <id>` lists where an id is defined and used — `def`, `test` (`@ac`), `symbol`,
`brief`, `ref`, one `file:line:col: role: text` line each (`--json` for editors). In Neovim: `<leader>hd` on the id jumps to its definition, `<leader>hr` lists every location.

**New work starts with `/hitl:go <description>`** (0.11): a read-only router picks the route and runs it in the same
turn — a note or `amend` when it changes an active change, `/hitl:tasks <id> update` for a missed slice,
`/hitl:tdd` when a reproducer exists (a failing input or an expected output, 1–2 functions), `/hitl:tasks quick` for a
trivial locked task with nothing to reproduce, else `/hitl:plan`. The routes are tried in that order; doubt moves the
work to the next, heavier one. Pick it yourself with `--plan`, `--quick` or `--tdd`.
**Tests** (0.16): the full flow writes a task's acceptance tests first, from the contract, then the code (acceptance
tests first, not Kent Beck's one-test loop; `/hitl:tdd` is that loop). In the tasks brief you decide per acceptance
criterion: `new: <the defect it catches>`, `shared: <ACk>`, `covered: <existing test>`, `none: <reason>` (not on
security, concurrency or data tasks) or `manual: <check>`; on such a task only your own `none!: <reason>` /
`manual!: <check> — <reason>` (0.20; 0.21: the `_Override:_` question's own Y in the tasks brief, its record) skips the automated test. Extra tests need a named defect; a task's tests stay within
`new` rows + 2 (a warning). Review may suggest merging or deleting tests (`hitl-index tests audit`); you approve every
deletion with `/hitl:approve <T> tests`.

```
/hitl:setup → /hitl:overview → /hitl:go <description> ─┬─ active change: note · /hitl:plan <id> amend · /hitl:tasks <id> update
                                                          ├─ reproducer, no record: /hitl:tdd [gate: seams, test list] → red→green→refactor
                                                          ├─ trivial, nothing to reproduce: /hitl:tasks quick [brief] → /hitl:implement T (fast)
                               ┌──────────────────────────┘ anything else
                               ▼
                               /hitl:plan (WHAT, brief file) → /hitl:design (HOW, brief file, skippable) → /hitl:tasks [brief + test plan]
                                                                                   │
          high risk ───────────────────────────────────────────────────────────────┤──── low risk (fast lane)
              ▼                                                                    │            ▼
   /hitl:skeleton T [gate] → /hitl:approve T                                       │  /hitl:implement T
   /hitl:test T [gate] → /hitl:approve T tests                                     │  (auto skeleton+tests)
   /hitl:implement T (manual fns: yours [gate])                                    │            │
              ▼                                                                    ▼            ▼
   /hitl:review T [gate] → /hitl:approve T done                   /hitl:review T → auto done on PASS
   all tasks done → /hitl:archive <change-id> [gate]  (deltas → living specs .hitl/specs/, change → .hitl/archive/)
   User-only override: /hitl:implement T --lane fast · whole change: /hitl:implement --feature <change-id> [--lane fast]
   Manual edits outside Claude → /hitl:sync · Optional side channel: /hitl:tickets push (Linear, Jira or GitHub; never a gate)
   Changed requirement mid-change → note → /hitl:plan <id> amend N-k ─┬─ wording only: [gate: delta, Impact, Apply?]
                                                                     └─ else amend brief [file: rounds, Close: delta, Impact, amend task set]
                                       → /hitl:approve <id> reopen (in-progress tasks, taken-over tests) → the amend set's tasks
   Too big for A → /hitl:go <X> --before A → A waits → <X> archived → A takes in: /hitl:plan A amend N-k [gate] → reopen as above
```

| command | purpose | gate |
|---|---|---|
| `/hitl:setup` | init `.hitl`, detect test cmds, opt-in pre-commit, migrate v0.5 planning | user-only |
| `/hitl:go <description> [--plan\|--quick\|--tdd] [--before <id>]` | entry for new work: a router subagent picks note/amend/update, tdd, tasks quick or plan and runs it; `--before <id>` = plan a prerequisite change `<id>` waits for | note (Y/n) · vague description (≤ 3 questions) · conflicting flags |
| `/hitl:overview` | steering docs BUSINESS / ARCHITECTURE / PATTERNS + generated CODEBASE-MAP | if docs exist |
| `/hitl:plan` | WHAT/WHY: proposal + spec deltas (requirements, scenarios), business-readable; rounds in `plan-brief.md`; `<id> amend [N-k]`: a wording-only chat gate, else an amend brief `amend-<KEY>-A<n>-brief.md` that ends in an amend task set | brief file, each round (amend: chat gate when wording only) |
| `/hitl:plan <description> --before <id>[,<id>]` | a prerequisite change: `<id>` waits until it is archived (notes in `<id>`) | brief file, each round |
| `/hitl:design` | HOW: design.md (<KEY>-D<n>), data-model, contracts — module level; rounds in `design-brief.md` (accept-all `Y` per round); `<id> amend [N-k]` as plan | brief file, each round (amend: chat gate when wording only) |
| `/hitl:tasks` | vertical-slice tasks, risk, ACs → scenarios, test plan (a test decision per AC: new · shared · covered · none · manual · rewrite); an existing tasks.md is always updated (per task state: edit, reopen, a new task for done work, `tasks drop` for an unneeded todo task); `quick <description>` / `<QKEY>` for a quick file | brief file `tasks-brief.md`, each round (approve: its own Y) |
| `/hitl:skeleton T` | stubs + intent tags + TODO flow + a test stub per `new` row | review in editor |
| `/hitl:approve T [stage]` | lock skeleton / tests / done; `--ack N-k` releases a note for T | user-only |
| `/hitl:approve <id> reopen [N-k]` | unlock what an amendment changed (tests per AC, skeleton symbols) and move taken-over tests to their new task; `dismiss N-k <reason>` · `defer N-k <change>` close a note | user-only |
| `/hitl:test T` | real failing tests via isolated test-author (regression tests may pass; RED table, budget `new` rows + 2) | high risk |
| `/hitl:implement T` | agent fns via implementer, manual fns handed to you | manual fns |
| `/hitl:implement --feature <id>` | all tasks of a change in order, one combined review | end / early stop |
| `/hitl:review T` | L0 gates + lens reviewers + report | if human needed |
| `/hitl:archive <id>` | merge spec deltas into living specs, move the change to archive | diff |
| `/hitl:sync` | reconcile manual edits, drift + trace report, amend spec | user-only |
| `/hitl:tickets` | mirror tasks to Linear, Jira or GitHub Issues (optional) | first push |
| `/hitl:grilling` | ad-hoc grill-me interview (plan and design load it automatically) | each round |
| `/hitl:tdd` | the real TDD loop (red → green → refactor, one test at a time; the test list grows) for small work with a reproducer, outside a change (adapted from mattpocock tdd); inside a change `/hitl:test` + `/hitl:implement` apply the same test rules | seams + test list |
| `/hitl:overlap <id> [<id> …]` | check one active change against others (`--with B,C`; none = all active): shared ids, contracts, terms, symbols, files, drift → one judge with a Given/When/Then witness per finding → adjust one side · both sides (notes, the affected change waits) · not an overlap | one line per finding |
| `/hitl:flow` | this status, task id routing and help (new work → `/hitl:go`) | — |
| `/hitl:migrate` | upgrade a pre-0.13 project to change-key ids (`PWR-T3`, `PWR-R1`, `PWR-D1`): dry run, one key table, rename map, then apply | keys + `Apply? (Y/n)` |

## Labels

hitl marks its lines with short italic labels instead of emoji. Only three symbols stay: ✅ done, ok or clear · ❌
failed or missing · ⚠️ drift, warning or partial; `→` starts a result, a brief mark (`→ recorded: …`) or the next
step. A label that stands alone drops its colon (`_Gate_`, `_Rec_`). Lines from hitl before 0.15 used emoji; the CLI
still reads them in existing brief files.

| label | meaning |
|---|---|
| `_Rec:_` | the recommended answer or option; `Y` takes it |
| `_Assumed:_` | a default Claude took without asking; say so if it is wrong |
| `_Tip:_` | an optional hint or suggestion |
| `_Info:_` | a fact; nothing to do |
| `_Next:_` | the next command to run |
| `_Stop:_` | blocked; the reason and the way out follow |
| `_Gate:_` | Claude waits for your answer before it goes on |
| `_Block:_` | a drift or trace item that blocks approval until it is fixed |
| `_Disc:_` | discussion: Claude's reply in a brief file to a question you wrote instead of an answer |
| `_Hot_` | hotspot: high impact and high uncertainty, asked first |
| `_Needs spec:_` | a design answer that needs a spec change (brief question; needs its own `Y`) |
| `_Needs term:_` | a word that needs a glossary definition |
| `_Parked:_` | an idea kept for a later step (e.g. for `/hitl:design`) |
| `_Forced:_` | the plan was closed with known gaps, at your request |
| `_Note_` | a note `N-k` on an active change: a change to approved behaviour, stated in chat or sent by another change |
| `_To P:_` | a brief question whose answer writes a note into change P (needs its own `Y`) |
| `_From P:_` | a note that came from change P |
| `_Take in:_` | a note from an archived change that this change must apply (amend) first |
| `_Waits:_` | this change waits until another change is archived |
| `_Blocks:_` | this change makes another change wait until it is archived |
| `_Unblocked:_` | a change no longer waits |
| `_Parent:_` | a change this new change is a prerequisite of (`--before`) |
| `_Overlap?_` | another active change may overlap this one; check it |
| `_Delta:_` | preview of a spec or design change (delta) before `Apply?` |
| `_Impact:_` | what an amend reopens: tests per AC, skeleton symbols |
| `_Reopen_` | locked work that an applied note reopened |
| `_Held:_` | a task an open amend brief touches: it waits until the amendment is approved |
| `_Amend set:_` | the tasks an amendment adds or changes, in their order (amend brief Close) |
| `_Yours:_` | work only you do: a manual function or test, a step in the ticket tracker |
| `_Fast_` | fast lane: skeleton and tests approved automatically (low risk, or your override) |
| `_Route:_` | the route `/hitl:go` picked, and why |
| `_Brief:_` | a brief file waits for your answers |
| `_Summary:_` | the summary of a finished step |
| `_Change:_` | one active change in the status |
| `_Trace:_` | coverage: requirements → scenarios → ACs → tests |
| `_Tickets:_` | the ticket tracker sync result |
| `_Queued_` | a ticket tracker update not pushed yet |
| `_Branch:_` | the git branch to create for a task (ticket tracker) |
| `_Spec:_` | one capability of the living specs |
| `_New_` | a new capability or doc block |
| `_Removed_` | a removed doc block |
| `_Reuse:_` | an existing helper that fits a step |
| `_Wrote:_` | a file that was written |
| `_Dry run:_` | a preview; nothing was written |
| `_Skip:_` | a skipped item: gate, test, symbol, or a check left for later |
| `_Todo_` | a test stub that is not active yet (trace table) |
| `_Stale_` | a test with no result for the current code (trace table) |

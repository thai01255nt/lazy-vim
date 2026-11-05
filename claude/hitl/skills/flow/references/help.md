# /hitl:flow help block (print it for `help` or "how does the workflow work")

## Help

**hitl's value is the human in the loop during implementation.** The spec and design gates are cheap and always on:
agree on *what* (plan) and *how* (design) before any code. After that you choose how often to look:
- **Default, step by step**: every high-risk task stops at skeleton → tests → implement → review. You approve
  contracts before code exists.
- **Fast lane** (`/hitl:implement <KEY>-T<n> --lane fast`): one task runs skeleton → tests → code without gates; you review
  the result.
- **Build then review** (`/hitl:implement --feature <change-id> --lane fast`, optionally after `/hitl:design --auto`):
  the whole change is built without gates, then one feature report lists everything to review and refine
  (`/hitl:review`, `fix F-n`, `amend F-n`). Locks, trace and drift still record everything, so nothing is silently
  unreviewed.
The spec gate (`/hitl:plan`) is never skipped. It is what the end-review checks against.
**Requirement changes mid-change** (0.9): say it in chat and Claude asks `📌 Note for <change>, refs …? (Y/n)`. The note
blocks the approvals of the tasks it touches. Apply it with `/hitl:plan <id> amend N-k` (or `/hitl:design … amend N-k`):
the preview shows what it reopens (tests per AC, skeleton symbols). Only you unlock locked work: `/hitl:approve <id>
reopen`. Escape hatches, also yours only: `/hitl:approve <KEY>-T<n> <stage> --ack N-k`, `… <id> dismiss N-k <reason>`,
`… <id> defer N-k <other-change>`.
**Two changes at once** (0.12): work that is too big for change A becomes its own change, created *before* A:
`/hitl:go <X> --before A` (several: `--before A,C`). A then waits: no task approval, implement or archive of A until the
new change is archived (A's plan, design and tasks stay open). While planning the new change, its effect on A goes into
A as a note (`source:`), never into A's files; after the new change is archived, A takes those notes in with
`/hitl:plan A amend N-k`. Planning also lists other active changes that share ids, files, contracts or terms
(`hitl-index overlap <id>`) and asks you what to do. Who goes first is your call; `/hitl:approve A dismiss N-k <reason>`
ends a wait.
At any ⛔ gate, `?` / `wait` / `hả` / `giải thích` / `không hiểu` → Claude re-explains in plain words (glossary terms,
ids with titles) and asks the same question again.
**Shared language and refactor** (0.8.x): `spec validate` and the review's `terms` gate warn when a business file or an
intent uses a glossary `_Avoid_` word (`"user record" → use Account`). After green, the review lists **structure
suggestions** (duplication, names off the glossary, pass-through functions, deep nesting, tests of private helpers):
`fix F-n` runs a refactor pass under green, untouched tests. Never a blocker.

**Ids** (0.13): every change has a short key (2–5 capitals, e.g. `PWR`, chosen at `/hitl:plan`); every id starts
with the key of the change that created it: `PWR-R1`, `PWR-R1.S1`, `PWR-BR1`, `PWR-D1`, tasks `PWR-T3`, ACs `PWR-T3.AC2`
(quick tasks `QT-T<n>`). Upgrading from 0.12: run `/hitl:migrate` once.

**New work starts with `/hitl:go <description>`** (0.11): a read-only router picks the route and runs it in the same
turn — a 📌 note or `amend` when it changes an active change, `/hitl:tasks <id> update` for a missed slice,
`/hitl:tdd` for a reproducible bug or small logic, `/hitl:tasks quick` for a trivial locked task, else `/hitl:plan`.
Ties go to the heavier route. Pick it yourself with `--plan`, `--quick` or `--tdd`.

```
/hitl:setup → /hitl:overview → /hitl:go <description> ─┬─ active change: 📌 note · /hitl:plan <id> amend · /hitl:tasks <id> update
                                                          ├─ bug or small logic, no record: /hitl:tdd ⛔ (seams) → red→green
                                                          ├─ trivial, worth a lock: /hitl:tasks quick ⛔ → /hitl:implement T (⚡)
                               ┌──────────────────────────┘ anything else
                               ▼
                               /hitl:plan ⛔ (WHAT) → /hitl:design ⛔ (HOW, skippable) → /hitl:tasks ⛔
                                                                                   │
          high risk ───────────────────────────────────────────────────────────────┤──── low risk (⚡ fast lane)
              ▼                                                                    │            ▼
   /hitl:skeleton T ⛔ → /hitl:approve T                                           │  /hitl:implement T
   /hitl:test T ⛔ → /hitl:approve T tests                                         │  (auto skeleton+tests)
   /hitl:implement T (✍️ manual fns ⛔)                                             │            │
              ▼                                                                    ▼            ▼
   /hitl:review T ⛔ → /hitl:approve T done                       /hitl:review T → auto done on PASS
   all tasks done → /hitl:archive <change-id> ⛔  (deltas → living specs .hitl/specs/, change → .hitl/archive/)
   User-only override: /hitl:implement T --lane fast · whole change: /hitl:implement --feature <change-id> [--lane fast]
   Manual edits outside Claude → /hitl:sync · Optional side channel: /hitl:tickets push (Linear, Jira or GitHub; never a gate)
   Changed requirement mid-change → 📌 note → /hitl:plan <id> amend N-k ⛔ (🔁 Impact) → /hitl:approve <id> reopen → /hitl:test T
   Too big for A → /hitl:go <X> --before A → ⏳ A waits → <X> archived → 📥 /hitl:plan A amend N-k ⛔ → reopen as above
```

| command | purpose | gate |
|---|---|---|
| `/hitl:setup` | init `.hitl`, detect test cmds, opt-in pre-commit, migrate v0.5 planning | ⛔ user-only |
| `/hitl:go <description> [--plan\|--quick\|--tdd] [--before <id>]` | entry for new work: a router subagent picks note/amend/update, tdd, tasks quick or plan and runs it; `--before <id>` = plan a prerequisite change `<id>` waits for | ⛔ only if vague (≤ 3 questions) |
| `/hitl:overview` | steering docs BUSINESS / ARCHITECTURE / PATTERNS + generated CODEBASE-MAP | ⛔ if docs exist |
| `/hitl:plan` | WHAT/WHY: proposal + spec deltas (requirements, scenarios), business-readable; `<id> amend [N-k]` | ⛔ each round |
| `/hitl:plan <description> --before <id>[,<id>]` | a prerequisite change: `<id>` waits until it is archived (notes in `<id>`) | ⛔ each round |
| `/hitl:design` | HOW: design.md (<KEY>-D<n>), data-model, contracts — module level; `--auto` | ⛔ each round |
| `/hitl:tasks` | vertical-slice tasks, risk, ACs → scenarios, test plan | ⛔ quiz |
| `/hitl:skeleton T` | stubs + intent tags + TODO flow + test stubs | ⛔ review in editor |
| `/hitl:approve T [stage]` | lock skeleton / tests / done; `--ack N-k` releases a note for T | user-only |
| `/hitl:approve <id> reopen [N-k]` | unlock what an amendment changed (tests per AC, skeleton symbols); `dismiss N-k <reason>` · `defer N-k <change>` close a note | user-only |
| `/hitl:test T` | real failing tests via isolated test-author | ⛔ high risk |
| `/hitl:implement T` | agent fns via implementer, manual fns handed to you | ⛔ manual fns |
| `/hitl:implement --feature <id>` | all tasks of a change in order, one combined review | ⛔ end / early stop |
| `/hitl:review T` | L0 gates + lens reviewers + report | ⛔ if human needed |
| `/hitl:archive <id>` | merge spec deltas into living specs, move the change to archive | ⛔ diff |
| `/hitl:sync` | reconcile manual edits, drift + trace report, amend spec | ⛔ user-only |
| `/hitl:tickets` | mirror tasks to Linear, Jira or GitHub Issues (optional) | ⛔ first push |
| `/hitl:grilling` | ad-hoc grill-me interview (plan and design load it automatically) | ⛔ each round |
| `/hitl:tdd` | hitl's quick test-first mode (adapted from mattpocock tdd) for small work outside a change; inside a change `/hitl:test` + `/hitl:implement` apply the same rules | ⛔ seams |
| `/hitl:flow` | this status, task id routing and help (new work → `/hitl:go`) | — |
| `/hitl:migrate` | upgrade a pre-0.13 project to change-key ids (`PWR-T3`, `PWR-R1`, `PWR-D1`): dry run, one key table, rename map, then apply | ⛔ keys + `Apply? (Y/n)` |

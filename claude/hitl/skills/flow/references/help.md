# /hitl:flow help block (print it for `help` or "how does the workflow work")

## Help

**hitl's value is the human in the loop during implementation.** The spec and design gates are cheap and always on:
agree on *what* (plan) and *how* (design) before any code. After that you choose how often to look:
- **Default, step by step**: every high-risk task stops at skeleton → tests → implement → review. You approve
  contracts before code exists.
- **Fast lane** (`/hitl:implement T-n --lane fast`): one task runs skeleton → tests → code without gates; you review
  the result.
- **Build then review** (`/hitl:implement --feature <change-id> --lane fast`, optionally after `/hitl:design --auto`):
  the whole change is built without gates, then one feature report lists everything to review and refine
  (`/hitl:review`, `fix F-n`, `amend F-n`). Locks, trace and drift still record everything, so nothing is silently
  unreviewed.
The spec gate (`/hitl:plan`) is never skipped. It is what the end-review checks against.
**Requirement changes mid-change** (0.9): say it in chat and Claude asks `📌 Note for <change>, refs …? (Y/n)`. The note
blocks the approvals of the tasks it touches. Apply it with `/hitl:plan <id> amend N-k` (or `/hitl:design … amend N-k`):
the preview shows what it reopens (tests per AC, skeleton symbols). Only you unlock locked work: `/hitl:approve <id>
reopen`. Escape hatches, also yours only: `/hitl:approve T-n <stage> --ack N-k`, `… <id> dismiss N-k <reason>`,
`… <id> defer N-k <other-change>`.
At any ⛔ gate, `?` / `wait` / `hả` / `giải thích` / `không hiểu` → Claude re-explains in plain words (glossary terms,
ids with titles) and asks the same question again.
**Shared language and refactor** (0.8.x): `spec validate` and the review's `terms` gate warn when a business file or an
intent uses a glossary `_Avoid_` word (`"user record" → use Account`). After green, the review lists **structure
suggestions** (duplication, names off the glossary, pass-through functions, deep nesting, tests of private helpers):
`fix F-n` runs a refactor pass under green, untouched tests. Never a blocker.

```
/hitl:setup → /hitl:overview → /hitl:plan ⛔ (WHAT) → /hitl:design ⛔ (HOW, skippable) → /hitl:tasks ⛔
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
```

| command | purpose | gate |
|---|---|---|
| `/hitl:setup` | init `.hitl`, detect test cmds, opt-in pre-commit, migrate v0.5 planning | ⛔ user-only |
| `/hitl:overview` | steering docs BUSINESS / ARCHITECTURE / PATTERNS + generated CODEBASE-MAP | ⛔ if docs exist |
| `/hitl:plan` | WHAT/WHY: proposal + spec deltas (requirements, scenarios), business-readable; `<id> amend [N-k]` | ⛔ each round |
| `/hitl:design` | HOW: design.md (D-n), data-model, contracts — module level; `--auto` | ⛔ each round |
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
| `/hitl:flow` | this status / router | — |

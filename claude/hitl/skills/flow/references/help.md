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
   Manual edits outside Claude → /hitl:sync · Optional side channel: /hitl:tickets push (Linear; never a gate)
```

| command | purpose | gate |
|---|---|---|
| `/hitl:setup` | init `.hitl`, detect test cmds, opt-in pre-commit, migrate v0.5 planning | ⛔ user-only |
| `/hitl:overview` | steering docs BUSINESS / ARCHITECTURE / PATTERNS + generated CODEBASE-MAP | ⛔ if docs exist |
| `/hitl:plan` | WHAT/WHY: proposal + spec deltas (requirements, scenarios), business-readable; `<id> amend` | ⛔ each round |
| `/hitl:design` | HOW: design.md (D-n), data-model, contracts — module level; `--auto` | ⛔ each round |
| `/hitl:tasks` | vertical-slice tasks, risk, ACs → scenarios, test plan | ⛔ quiz |
| `/hitl:skeleton T` | stubs + intent tags + TODO flow + test stubs | ⛔ review in editor |
| `/hitl:approve T [stage]` | lock skeleton / tests / done | user-only |
| `/hitl:test T` | real failing tests via isolated test-author | ⛔ high risk |
| `/hitl:implement T` | agent fns via implementer, manual fns handed to you | ⛔ manual fns |
| `/hitl:implement --feature <id>` | all tasks of a change in order, one combined review | ⛔ end / early stop |
| `/hitl:review T` | L0 gates + lens reviewers + report | ⛔ if human needed |
| `/hitl:archive <id>` | merge spec deltas into living specs, move the change to archive | ⛔ diff |
| `/hitl:sync` | reconcile manual edits, drift + trace report, amend spec | ⛔ user-only |
| `/hitl:tickets` | mirror tasks to Linear (optional) | ⛔ first push |
| `/hitl:grilling` | ad-hoc grill-me interview (plan and design load it automatically) | ⛔ each round |
| `/hitl:flow` | this status / router | — |

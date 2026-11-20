# {Change title} Tasks

← Change: {change-id}

> status: draft

<!-- task ids {KEY}-T<n> from `hitl-index next-id {change-id}` ({KEY} = the change key). A quick file instead:
     header `← Change: none | key: {QKEY}`, one task {QKEY}-T1 from `hitl-index next-id --quick {slug}` -->

<!-- 0.17 amend task set (shared/task-changes.md), all optional: meta `| amend: PWR-A1 | kind: switch` before
     `| status:` (kinds prep · expand · migrate · switch · contract · revert); a Symbols row `remove` (the task deletes
     it); a test-plan cell `rewrite: <locked test or old AC id>` (takes over a done task's test); under a done task's
     ACs `- superseded: PWR-T12.AC2 → PWR-T15.AC1 (PWR-A1)`; `status: dropped` + `**Dropped**: <reason>` only from
     `hitl-index tasks drop`. -->

## PWR-T12 Register user with unique email

- prio: P1 | risk: high (security, public-api) | impl: mixed | blocked-by: PWR-T11 | status: todo

**Why**: {1–2 lines; cite the design decisions it implements, e.g. (PWR-D1, PWR-D2)}

### Acceptance criteria

- [ ] PWR-T12.AC1 (PWR-R1.S1) Given an existing email in any case When createUser Then throws DuplicateEmailError
- [ ] PWR-T12.AC2 (SGN-R2.S1) Given a new email When createUser Then returns the saved user without passwordHash

### Symbols

1. [ ] `UserService.createUser` | new | `src/services/userService.ts` | impl: agent | validates, rejects duplicates, persists
2. [ ] `UserRepo.findByEmail` | modify | `src/repo/userRepo.ts` | impl: manual | case-insensitive lookup

### Test plan

<!-- one row per AC; the test cell is the test decision: new: <the defect it catches> · shared: <ACk> (one test, both
     @ac) · covered: <test title, file#title or AC id> · none: <reason> (not on security/concurrency/data tasks) ·
     manual: <check> (same limit) · none!: <reason> / manual!: <check> — <reason> only after the human's own Y
     (the override of that limit). Non-new rows may leave kind/oracle/seam/author as "—". -->

| ac  | test                                      | kind     | oracle                                  | seam                   | author      |
| --- | ----------------------------------------- | -------- | --------------------------------------- | ---------------------- | ----------- |
| AC1 | new: a duplicate in another case is saved | example  | spec                                    | UserService.createUser | test-author |
| AC2 | new: the result leaks passwordHash        | property | invariant: result.email == lower(input) | UserService.createUser | test-author |

### Notes

- {constraints, reuse hints: "reuse PasswordHasher.hash"}

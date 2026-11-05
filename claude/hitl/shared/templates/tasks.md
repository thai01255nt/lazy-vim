# {Change title} Tasks
← Change: {change-id}
> status: draft

<!-- task ids {KEY}-T<n> from `hitl-index next-id {change-id}` ({KEY} = the change key; quick tasks: QT-T<n>) -->

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
| ac | kind | oracle | seam | author |
|----|------|--------|------|--------|
| AC1 | example | spec | UserService.createUser | test-author |
| AC2 | property | invariant: result.email == lower(input) | UserService.createUser | test-author |

### Notes
- {constraints, reuse hints: "reuse PasswordHasher.hash"}

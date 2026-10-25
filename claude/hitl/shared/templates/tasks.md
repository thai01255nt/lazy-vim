# {Feature} Tasks
← Planning: .hitl/planning/{type}-{feature}.md
> status: draft

## T-12 Register user with unique email
- prio: P1 | risk: high (security, public-api) | impl: mixed | blocked-by: T-11 | status: todo
**Why**: {1–2 lines; cite the decisions it implements, e.g. (D-1, D-2)}

### Acceptance criteria
- [ ] T-12.AC1 (R-1) Given an existing email in any case When createUser Then throws DuplicateEmailError
- [ ] T-12.AC2 (R-2) Given a new email When createUser Then returns the saved user without passwordHash

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

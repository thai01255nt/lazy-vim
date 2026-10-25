# User Register Tasks
← Planning: .hitl/planning/feat-user-register.md
> status: approved

## T-1 Register user with unique email
- prio: P1 | risk: high (security) | impl: mixed | blocked-by: none | status: skeleton
**Why**: duplicate emails in a different case must be rejected (D-1, D-2)

### Acceptance criteria
- [ ] T-1.AC1 (R-1) Given an existing email in any case When createUser Then throws a duplicate error
- [ ] T-1.AC2 (R-2) Given a new email When createUser Then returns the saved user

### Symbols
1. [ ] `UserService.createUser` | modify | `src/services/userService.ts` | impl: agent | rejects duplicates, saves, returns the user
2. [ ] `UserRepo.findByEmail` | modify | `src/repo/userRepo.ts` | impl: manual | case-insensitive lookup

### Test plan
| ac | kind | oracle | seam | author |
|----|------|--------|------|--------|
| AC1 | example | spec | UserService.createUser | test-author |
| AC2 | example | spec | UserService.createUser | test-author |

### Notes
- Reuse UserRepo.save; do not add new modules.

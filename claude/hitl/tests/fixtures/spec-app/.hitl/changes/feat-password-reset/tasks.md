# Password reset Tasks
← Change: feat-password-reset
> status: approved

## T-12 Send a reset link
- prio: P1 | risk: high (security) | impl: mixed | blocked-by: none | status: done
**Why**: single-use hashed token (D-1)

### Acceptance criteria
- [x] T-12.AC1 (ACC-R5.S1) Given a registered email in another case When a reset is requested Then one link is sent
- [x] T-12.AC2 (ACC-R5.S2) Given an unknown email When a reset is requested Then the same message shows and nothing is sent

### Test plan
| ac | kind | oracle | seam | author |
|----|------|--------|------|--------|
| AC1 | example | spec | reset endpoint | test-author |
| AC2 | example | spec | reset endpoint | test-author |

## T-13 Set a new password
- prio: P1 | risk: high (security) | impl: agent | blocked-by: T-12 | status: todo

### Acceptance criteria
- [ ] T-13.AC1 (ACC-R6.S1) Given a valid link When a new password is set Then sign-in works with it

### Test plan
| ac | kind | oracle | seam | author |
|----|------|--------|------|--------|
| AC1 | example | spec | reset endpoint | test-author |

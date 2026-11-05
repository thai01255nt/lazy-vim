# Password reset Tasks
← Change: feat-password-reset
> status: approved

## PWR-T1 Send a reset link
- prio: P1 | risk: high (security) | impl: mixed | blocked-by: none | status: done
**Why**: single-use hashed token (PWR-D1)

### Acceptance criteria
- [x] PWR-T1.AC1 (PWR-R1.S1) Given a registered email in another case When a reset is requested Then one link is sent
- [x] PWR-T1.AC2 (PWR-R1.S2) Given an unknown email When a reset is requested Then the same message shows and nothing is sent

### Test plan
| ac | kind | oracle | seam | author |
|----|------|--------|------|--------|
| AC1 | example | spec | reset endpoint | test-author |
| AC2 | example | spec | reset endpoint | test-author |

## PWR-T2 Set a new password
- prio: P1 | risk: high (security) | impl: agent | blocked-by: PWR-T1 | status: todo

### Acceptance criteria
- [ ] PWR-T2.AC1 (PWR-R2.S1) Given a valid link When a new password is set Then sign-in works with it

### Test plan
| ac | kind | oracle | seam | author |
|----|------|--------|------|--------|
| AC1 | example | spec | reset endpoint | test-author |

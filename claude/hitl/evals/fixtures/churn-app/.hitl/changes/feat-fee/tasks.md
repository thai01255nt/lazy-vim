# Settlement fee Tasks
← Change: feat-fee
> status: approved

## T-1 Settle with a fee
- prio: P0 | risk: high (money) | impl: agent | blocked-by: none | status: todo
**Why**: fee on every settlement

### Acceptance criteria
- [ ] T-1.AC1 (BIL-R1.S1) Given 0 When settle Then at least 0
- [ ] T-1.AC2 (BIL-R1.S2) Given 10 When settle Then 11

### Symbols
1. [ ] `settle` | new | `src/settle.ts` | impl: agent | settle with the fee

### Test plan
| ac | kind | oracle | seam | author |
|----|------|--------|------|--------|
| AC1 | example | spec | settle | test-author |
| AC2 | example | spec | settle | test-author |

## T-2 Record a receipt
- prio: P1 | risk: high (money) | impl: agent | blocked-by: T-1 | status: todo
**Why**: audit

### Acceptance criteria
- [ ] T-2.AC1 (BIL-R2.S1) Given 10 When settle Then one receipt

### Test plan
| ac | kind | oracle | seam | author |
|----|------|--------|------|--------|
| AC1 | example | spec | settle | test-author |

# Settlement fee Tasks
← Change: feat-fee
> status: approved

## FEE-T1 Settle with a fee
- prio: P0 | risk: high (money) | impl: agent | blocked-by: none | status: todo
**Why**: fee on every settlement

### Acceptance criteria
- [ ] FEE-T1.AC1 (FEE-R1.S1) Given 0 When settle Then at least 0
- [ ] FEE-T1.AC2 (FEE-R1.S2) Given 10 When settle Then 11

### Symbols
1. [ ] `settle` | new | `src/settle.ts` | impl: agent | settle with the fee

### Test plan
| ac | kind | oracle | seam | author |
|----|------|--------|------|--------|
| AC1 | example | spec | settle | test-author |
| AC2 | example | spec | settle | test-author |

## FEE-T2 Record a receipt
- prio: P1 | risk: high (money) | impl: agent | blocked-by: FEE-T1 | status: todo
**Why**: audit

### Acceptance criteria
- [ ] FEE-T2.AC1 (FEE-R2.S1) Given 10 When settle Then one receipt

### Test plan
| ac | kind | oracle | seam | author |
|----|------|--------|------|--------|
| AC1 | example | spec | settle | test-author |

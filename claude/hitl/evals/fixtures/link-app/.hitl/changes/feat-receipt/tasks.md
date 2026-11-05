# Settlement receipt Tasks
← Change: feat-receipt
> status: approved

## T-1 Receipt for the settled amount
- prio: P1 | risk: high (money) | impl: agent | blocked-by: none | status: todo

### Acceptance criteria
- [ ] T-1.AC1 (BIL-R1.S1) Given 10 When settle Then the receipt shows the settled amount

### Symbols
1. [ ] `settle` | modify | `src/settle.ts` | impl: agent | settle and record

## T-2 Store receipts
- prio: P2 | risk: low | impl: agent | blocked-by: none | status: todo

### Acceptance criteria
- [ ] T-2.AC1 (BIL-R2.S1) Given 10 When settle Then one receipt

# Label typo Tasks
← Change: none
> status: approved

## T-20 Fix the label typo
- prio: P2 | risk: low | impl: agent | blocked-by: none | status: approved

### Acceptance criteria
- [ ] T-20.AC1 Given a label with the typo When it is shown Then it reads correctly

### Symbols
1. [ ] `fix_label` | new | `src/labels.py` | impl: agent | corrects the label

### Test plan
| ac | kind | oracle | seam | author |
|----|------|--------|------|--------|
| AC1 | example | spec | fix_label | test-author |

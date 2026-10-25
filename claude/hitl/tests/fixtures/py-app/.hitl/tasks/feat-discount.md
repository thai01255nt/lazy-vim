# Discount Tasks
← Planning: .hitl/planning/feat-discount.md
> status: approved

## T-2 Apply a one-time order discount
- prio: P2 | risk: low | impl: mixed | blocked-by: none | status: skeleton
**Why**: discounts are applied once and rounded half up (D-1)

### Acceptance criteria
- [ ] T-2.AC1 Given pct outside 0..100 When apply_discount Then raises ValueError
- [ ] T-2.AC2 Given Decimal("1.005") When round_money Then returns Decimal("1.01")

### Symbols
1. [ ] `round_money` | modify | `orders.py` | impl: agent | round to cents, half up
2. [ ] `apply_discount` | modify | `orders.py` | impl: manual | validate, apply once, round

### Test plan
| ac | kind | oracle | seam | author |
|----|------|--------|------|--------|
| AC1 | example | spec | apply_discount | test-author |
| AC2 | example | spec | round_money | test-author |

### Notes
- Use decimal.ROUND_HALF_UP.

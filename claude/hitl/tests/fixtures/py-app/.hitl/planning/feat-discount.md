# Discount - Planning
> status: approved | tasks: .hitl/tasks/feat-discount.md | updated: 2026-10-25

## Goal
Apply a one-time percentage discount to an order, rounding money half up.

## Level 1 - Components
1. Discount → apply_discount, round_money

## Decisions
| id | decision | why | cost if wrong | status |
|----|----------|-----|---------------|--------|
| D-1 | Round half up to cents | accounting rule | off-by-cent totals | accepted |

## Acceptance (feature level)
- Given pct outside 0..100 When apply_discount Then ValueError
- Given 1.005 When round_money Then 1.01

## Out of scope
- Currency conversion

## Open questions

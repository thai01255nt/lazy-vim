<!-- audience: business -->
# Settlement fee
> change: feat-fee | status: approved | created: 2026-11-01 | updated: 2026-11-01

## Why
Each settlement costs the business a fixed fee that customers do not pay today.

## What changes
- A settlement adds a fee to the amount.
- Every settlement records a receipt.

## Capabilities
| capability | key | change | requirements |
|---|---|---|---|
| billing | BIL | new | +BIL-R1 +BIL-R2 |

## Artifacts
| artifact | decision | why |
|---|---|---|
| spec delta | included | always |
| design | skipped | one function, no new dependency |

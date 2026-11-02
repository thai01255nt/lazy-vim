<!-- audience: business -->
# Burst credit for trusted clients
> change: feat-burst-credit | status: approved | created: 2026-10-28 | updated: 2026-10-28

## Why
Trusted clients send short bursts (a page load fans out into many calls) and get refused although their average use is low.

## What changes
- A trusted client may borrow up to its burst limit beyond the tokens in its bucket.
- Borrowed tokens are paid back first when the bucket refills.

## Capabilities
| capability | key | change | requirements |
|---|---|---|---|
| ratelimit | RL | modified | +RL-R3 +RL-BR1 ~RL-R2 |

## Success criteria
- SC-1 Trusted clients see no refusals during page loads whose average use is within their rate.

## Out of scope
- Changing which clients are trusted.

## Assumptions
- The burst limit is set per bucket by the operator.

## Artifacts
| artifact | decision | why |
|---|---|---|
| spec delta | included | always |
| design | included | debt accounting touches refill |

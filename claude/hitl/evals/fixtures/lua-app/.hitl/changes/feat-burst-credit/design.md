<!-- audience: dev -->
# Design: Burst credit for trusted clients
> change: feat-burst-credit | status: approved | updated: 2026-10-28

## Context
- Buckets are plain Lua tables handled by src/ratelimit/bucket_util.lua (source: src/ratelimit/bucket_util.lua)

## Goals / Non-goals
- Goal: burst borrowing with pay-back on refill. Non-goal: per-client trust management.

## Decisions
| id | decision | why | alternatives | cost if wrong | serves | status |
|----|----------|-----|--------------|---------------|--------|--------|
| BURST-D1 | Track borrowed tokens as a separate `debt` field on the bucket, never as negative `tokens` | keeps the LRL-R1 invariant tokens >= 0 readable | negative token balance | silent over-admission, broken refill math | BURST-R1, BURST-BR1 | accepted |
| BURST-D2 | Plan first (pure, no writes), then apply | a refused request must change nothing (BURST-BR1) | check-and-write in one pass | partial writes on refusal | BURST-R1, BURST-BR1 | accepted |

## Components
- bucket_util — bucket helpers — modified — BURST-D1, BURST-D2

## Data model
- Bucket gains `debt` (number, >= 0, tokens borrowed) and `burstLimit` (number, >= 0, 0 = no burst).

## Test strategy
- BURST-R1, LRL-R2: busted unit tests on bucket tables with a fixed clock.

## Risks
- correctness: refill must repay debt before adding tokens, else clients borrow forever.

## Changelog

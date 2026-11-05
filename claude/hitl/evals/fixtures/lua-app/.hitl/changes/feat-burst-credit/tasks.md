# Burst credit for trusted clients Tasks
← Change: feat-burst-credit
> status: approved

## BURST-T1 Borrow burst credit and repay it on refill
- prio: P1 | risk: low | impl: agent | blocked-by: none | status: todo
**Why**: debt is a separate field (BURST-D1); plan before any write so refusals change nothing (BURST-D2)

### Acceptance criteria
- [ ] BURST-T1.AC1 (BURST-R1.S1) Given 2 tokens, burst limit 5, no debt When a request costs 4 Then it is allowed, tokens 0, debt 2
- [ ] BURST-T1.AC2 (BURST-R1.S2) Given 0 tokens, burst limit 5, debt 4 When a request costs 2 Then it is refused and the bucket is unchanged
- [ ] BURST-T1.AC3 (BURST-R1.S3) Given 1 token and no burst limit When a request costs 3 Then it is refused
- [ ] BURST-T1.AC4 (LRL-R2.S2) Given 0 tokens, debt 3, rate 1/s When 5 s pass Then debt 0 and tokens 2

### Symbols
1. [ ] `planBurst` | new | `src/ratelimit/bucket_util.lua` | impl: agent | pure: splits a cost into tokens taken and tokens borrowed, or refuses; takes an options table (bucket, count)
2. [ ] `refillBucket` | modify | `src/ratelimit/bucket_util.lua` | impl: agent | repays debt before adding tokens
3. [ ] `M.takeWithBurst` | new | `src/ratelimit/bucket_util.lua` | impl: agent | refill, plan, then apply the plan or refuse; exported

### Test plan
| ac | kind | oracle | seam | author |
|----|------|--------|------|--------|
| AC1 | example | spec | M.takeWithBurst | test-author |
| AC2 | example | spec | M.takeWithBurst | test-author |
| AC3 | example | spec | M.takeWithBurst | test-author |
| AC4 | example | spec | refillBucket | test-author |

### Notes
- Bucket gets `debt` and `burstLimit` fields (data model in design.md).

<!-- audience: business -->
# Delta: Rate limiting
> capability: ratelimit | key: RL | change: feat-burst-credit

## ADDED Requirements
### Requirement: RL-R3 Borrow burst credit
When a request costs more tokens than the bucket holds, the system SHALL allow it if the shortfall plus the tokens already borrowed stays within the bucket's burst limit, and SHALL record the shortfall as borrowed.
Rules: RL-BR1

#### Scenario: RL-R3.S1 Shortfall within the burst limit
- GIVEN a bucket holding 2 tokens, a burst limit of 5 and nothing borrowed
- WHEN a request costing 4 tokens arrives
- THEN the request is allowed
- AND the bucket holds 0 tokens
- AND 2 tokens are borrowed

#### Scenario: RL-R3.S2 Shortfall beyond the burst limit
- GIVEN a bucket holding 0 tokens, a burst limit of 5 and 4 tokens borrowed
- WHEN a request costing 2 tokens arrives
- THEN the request is refused
- AND nothing changes

#### Scenario: RL-R3.S3 No burst limit
- GIVEN a bucket holding 1 token and no burst limit
- WHEN a request costing 3 tokens arrives
- THEN the request is refused

## MODIFIED Requirements
### Requirement: RL-R2 Refill over time
While time passes, the system SHALL add tokens to each bucket at its rate, first paying back borrowed tokens, never above its capacity.
Rules: RL-BR1

#### Scenario: RL-R2.S1 Refill stops at capacity
- GIVEN a bucket of capacity 10 holding 9 tokens, a rate of 1 token per second and nothing borrowed
- WHEN 5 seconds pass
- THEN the bucket holds 10 tokens

#### Scenario: RL-R2.S2 Refill pays back borrowed tokens first
- GIVEN a bucket holding 0 tokens with 3 tokens borrowed and a rate of 1 token per second
- WHEN 5 seconds pass
- THEN nothing is borrowed any more
- AND the bucket holds 2 tokens
Changed: refill now pays back borrowed tokens before filling the bucket.

## ADDED Rules
### Rule: RL-BR1 Borrowed tokens never exceed the burst limit
The tokens borrowed by a bucket are always between 0 and its burst limit; a request that would break this is refused whole (never partly served).

Hit policy: U (unique)

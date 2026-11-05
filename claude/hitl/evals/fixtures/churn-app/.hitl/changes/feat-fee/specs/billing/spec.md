<!-- audience: business -->
# Delta: Billing
> capability: billing | key: BIL | change: feat-fee

## Purpose
How a charge is settled.

## ADDED Requirements
### Requirement: BIL-R1 Settle with a fee
When a charge is settled, the system SHALL add the settlement fee of 1 to the amount.

#### Scenario: BIL-R1.S1 Zero amount
- GIVEN an amount of 0
- WHEN it is settled
- THEN the result is at least 0

#### Scenario: BIL-R1.S2 Fee added
- GIVEN an amount of 10
- WHEN it is settled
- THEN the result is 11

### Requirement: BIL-R2 Settlement receipt
When a charge is settled, the system SHALL record a receipt.

#### Scenario: BIL-R2.S1 Receipt recorded
- GIVEN an amount of 10
- WHEN it is settled
- THEN one receipt is recorded

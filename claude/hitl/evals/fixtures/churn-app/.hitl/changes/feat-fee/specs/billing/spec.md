<!-- audience: business -->
# Delta: Billing
> capability: billing | change: feat-fee

## Purpose
How a charge is settled.

## ADDED Requirements
### Requirement: FEE-R1 Settle with a fee
When a charge is settled, the system SHALL add the settlement fee of 1 to the amount.

#### Scenario: FEE-R1.S1 Zero amount
- GIVEN an amount of 0
- WHEN it is settled
- THEN the result is at least 0

#### Scenario: FEE-R1.S2 Fee added
- GIVEN an amount of 10
- WHEN it is settled
- THEN the result is 11

### Requirement: FEE-R2 Settlement receipt
When a charge is settled, the system SHALL record a receipt.

#### Scenario: FEE-R2.S1 Receipt recorded
- GIVEN an amount of 10
- WHEN it is settled
- THEN one receipt is recorded

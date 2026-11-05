<!-- audience: business -->
# Delta: Billing
> capability: billing | key: BIL | change: feat-receipt

## ADDED Requirements
### Requirement: BIL-R2 Settlement receipt
When a charge is settled, the system SHALL record a receipt.

#### Scenario: BIL-R2.S1 Receipt recorded
- GIVEN an amount of 10
- WHEN it is settled
- THEN one receipt is recorded

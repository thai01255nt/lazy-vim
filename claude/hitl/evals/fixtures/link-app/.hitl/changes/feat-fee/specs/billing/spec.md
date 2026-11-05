<!-- audience: business -->
# Delta: Billing
> capability: billing | key: BIL | change: feat-fee

## MODIFIED Requirements
### Requirement: BIL-R1 Settle a charge
When a charge is settled, the system SHALL add the settlement fee to the amount.

#### Scenario: BIL-R1.S1 Amount kept
- GIVEN an amount of 10
- WHEN it is settled
- THEN the result is 11
Changed: a settlement now adds a fee of 1.

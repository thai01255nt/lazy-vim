<!-- audience: business -->
# Delta: Accounts
> capability: accounts | change: feat-2fa

## ADDED Requirements
### Requirement: TFA-R1 Two-factor code
When a user with two-factor sign-in enabled enters a correct password, the system SHALL ask for a one-time code.
Quality: security

#### Scenario: TFA-R1.S1 Code requested
- GIVEN a user with two-factor sign-in enabled
- WHEN they enter the correct password
- THEN they are asked for a one-time code
- AND they are not signed in yet

## REMOVED Requirements
### Requirement: LACC-R3 Security questions
Reason: replaced by two-factor sign-in

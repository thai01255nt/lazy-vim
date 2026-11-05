<!-- audience: business -->
# Delta: Accounts
> capability: accounts | key: ACC | change: feat-2fa

## ADDED Requirements
### Requirement: ACC-R3 Two-factor code
When a user with two-factor sign-in enabled enters a correct password, the system SHALL ask for a one-time code.
Quality: security

#### Scenario: ACC-R3.S1 Code requested
- GIVEN a user with two-factor sign-in enabled
- WHEN they enter the correct password
- THEN they are asked for a one-time code
- AND they are not signed in yet

## REMOVED Requirements
### Requirement: ACC-R4 Security questions
Reason: replaced by two-factor sign-in

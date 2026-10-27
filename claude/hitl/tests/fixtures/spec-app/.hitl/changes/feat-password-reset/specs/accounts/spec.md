<!-- audience: business -->
# Delta: Accounts
> capability: accounts | key: ACC | change: feat-password-reset

## ADDED Requirements
### Requirement: ACC-R5 Reset password by email
When a registered user asks to reset their password, the system SHALL send a single-use reset link to the account's email address.
Quality: security (confidentiality)
Fit: a security review finds no stored or logged reset link that could be reused
Rules: ACC-BR1

#### Scenario: ACC-R5.S1 Known email receives a link
- GIVEN a registered user with email "ana@example.com"
- WHEN a reset is requested for "ANA@example.com"
- THEN one reset link is sent to "ana@example.com"

#### Scenario: ACC-R5.S2 Unknown email reveals nothing
- GIVEN no account uses "bob@example.com"
- WHEN a reset is requested for "bob@example.com"
- THEN the same confirmation message is shown
- AND no email is sent

### Requirement: ACC-R6 Set a new password
When a user opens a valid reset link and enters a new password, the system SHALL replace the old password.
Rules: ACC-BR1

#### Scenario: ACC-R6.S1 New password works
- GIVEN a valid reset link for "ana@example.com"
- WHEN a new password is set through it
- THEN the user can sign in with the new password

## MODIFIED Requirements
### Requirement: ACC-R1 Sign in
When a registered user enters their email in any letter case and their password, the system SHALL sign them in.

#### Scenario: ACC-R1.S1 Correct password
- GIVEN a registered user with email "ana@example.com"
- WHEN they sign in with the correct password
- THEN they see their account home

#### Scenario: ACC-R1.S2 Wrong password
- GIVEN a registered user with email "ana@example.com"
- WHEN they sign in with a wrong password
- THEN they see "email or password is wrong"

#### Scenario: ACC-R1.S3 Email in another case
- GIVEN a registered user with email "ana@example.com"
- WHEN they sign in as "Ana@Example.com" with the correct password
- THEN they see their account home
Changed: sign-in now also accepts the email in any letter case.

## REMOVED Requirements
### Requirement: ACC-R2 Remember me
Reason: unsafe on shared computers and rarely used.

## ADDED Rules
### Rule: ACC-BR1 Reset link validity
A reset link is valid for 30 minutes and for one use only.

Hit policy: U (unique)

| # | link age (in) | already used (in) | outcome (out) |
|---|---|---|---|
| 1 | ≤ 30 min | no | accept |
| 2 | ≤ 30 min | yes | reject "link already used" |
| 3 | > 30 min | any | reject "link expired" |

## ADDED Flows
### Flow: ACC-UC1 Recover access
Primary actor: registered user · Scope: accounts · Level: user goal
Trigger: the user forgot their password
Preconditions: none
Success guarantee: the user can sign in with the new password; the link no longer works
Main success scenario:
1. The user asks for a reset with their email.
2. The system sends a reset link (ACC-R5).
3. The user opens the link and sets a new password (ACC-R6).
Extensions:
2a. Unknown email: the system shows the same confirmation and sends nothing (ACC-R5.S2).
3a. The link is older than 30 minutes or already used: the system rejects it (ACC-BR1).

<!-- audience: business -->
# Password reset by email
> change: feat-password-reset | status: approved | created: 2026-10-27 | updated: 2026-10-27

## Why
Users who forget their password cannot get back in and write to support, which takes a day to answer.

## What changes
- Users can ask for a reset link by email and set a new password.
- Sign-in accepts the email in any letter case.
- BREAKING: "remember me" is removed.

## Capabilities
| capability | key | change | requirements |
|---|---|---|---|
| accounts | ACC | modified | +ACC-R5 +ACC-R6 +ACC-BR1 +ACC-UC1 ~ACC-R1 -ACC-R2 |

## Success criteria
- SC-1 Fewer than 5 support requests per week about lost passwords.

## Out of scope
- Reset by phone.

## Assumptions
- Every account has a confirmed email address.

## Artifacts
| artifact | decision | why |
|---|---|---|
| spec delta | included | always |
| glossary | included | new term "reset link" |
| business rules | included | ACC-BR1 link validity |
| decision table | assumed | ACC-BR1 has 2 interacting conditions |
| use-case flow | included | 3 steps with an alternate path |
| design | included | new email dependency |

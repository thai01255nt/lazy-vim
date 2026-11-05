<!-- audience: dev -->
# Design: Password reset by email
> change: feat-password-reset | status: approved | updated: 2026-10-27

## Context
- Mail is sent through the existing notifier module (source: src/notify/mailer.ts)

## Goals / Non-goals
- Goal: reset by email. Non-goal: reset by phone.

## Decisions
| id | decision | why | alternatives | cost if wrong | serves | status |
|----|----------|-----|--------------|---------------|--------|--------|
| PWR-D1 | Store a hash of the reset token, never the token | leak-safe | plain token | account takeover | PWR-R1, PWR-BR1 | accepted |
| PWR-D2 | Normalise emails to lower case at the boundary | one rule for all paths | case-insensitive queries | duplicate accounts | LACC-R1 | accepted |

## Components
- ResetService — issues and redeems reset tokens — new — PWR-D1

## Contracts
- contracts/reset-email.md — the email sent to the user

## Test strategy
- PWR-R1, PWR-R2: HTTP endpoint tests with a fake mailer.

## Risks
- security: reset tokens cross the trust boundary in email links.

## Changelog

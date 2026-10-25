# User Register - Planning
> status: approved | tasks: .hitl/tasks/feat-user-register.md | updated: 2026-10-25

<!-- Part A — WHAT / WHY: behaviour only. No file names, signatures, classes or libraries here. -->
## Goal
Let a new user register with an email and password. Emails are unique regardless of case. Success: a duplicate registration is rejected.

## Requirements
- R-1 [must] If a user registers with an email that already exists in any letter case, then the system shall reject the registration.
- R-2 [must] When a user registers with a new email, the system shall return the saved user.

## Out of scope
- Password hashing and persistence to a database

<!-- Part B — HOW -->
## Context & Constraints
- Users live in an in-memory repository (source: src/repo/userRepo.ts)
- The HTTP layer calls the service directly (source: src/http/authController.ts)

## Level 1 - Components
1. User service → register, duplicate check
2. User repository → case-insensitive lookup

## Level 1 Component Details
### User service (Level 1 Item)
**Problem**: registration must reject an email that already exists in any case.
**Approach**: look up through the repository before saving (D-1)

### User repository (Level 1 Item)
**Problem**: stored emails keep their original case.
**Approach**: compare case-insensitively on lookup; the human writes it (D-2)

### Other Components (Not Yet Brainstormed)

## Decisions
| id | decision | why | cost if wrong | serves | status |
|----|----------|-----|---------------|--------|--------|
| D-1 | Duplicate check in UserService.createUser | single entry point | duplicates slip in | R-1, R-2 | accepted |
| D-2 | UserRepo.findByEmail is human-owned | core lookup rule | wrong matching | R-1 | accepted |

## Test seams
- UserService.createUser — the highest seam below HTTP

## Risks
- security: account takeover through case-variant duplicate emails

## Open questions

## Changelog
- 2026-10-25 Requirements R-1, R-2 replace the feature-level acceptance lines (source: hitl v2 fixture)

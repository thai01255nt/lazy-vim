<!-- audience: business -->
# Deactivate an account
> change: feat-deactivate-account | key: FDCA | status: draft | created: 2026-11-19 | updated: 2026-11-19

## Why
Support staff cannot stop a person from signing in today; abusive accounts stay active until a developer edits the data.

## What changes
- Support staff can deactivate an account; a deactivated account can no longer sign in.

## Capabilities
| capability | change | requirements |
|---|---|---|
| accounts | modified | |

## Assumptions
- Accounts are stored with a name and an email; there is no active or inactive state today.

## Coverage
| category | status | note |
|---|---|---|
| Scope & behaviour | ⚠️ | main flow stated, out of scope not yet |
| Actors & permissions | ⚠️ | support staff named; who must not is open |
| Data & lifecycle | ❌ | |
| Business rules | ❌ | |
| Edge cases & errors | ❌ | |
| Integrations | ❌ | |
| Quality (NFR) | ❌ | |
| Terminology | ⚠️ | "account" vs "user" |
| Success criteria | ❌ | |

## Artifacts
| artifact | decision | why |
|---|---|---|
| spec delta | included | always |

## Open questions

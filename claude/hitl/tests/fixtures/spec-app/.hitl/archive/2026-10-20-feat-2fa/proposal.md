<!-- audience: business -->
# Two-factor sign-in
> change: feat-2fa | status: approved | created: 2026-10-10 | updated: 2026-10-20

## Why
Passwords alone are guessed too often; security questions are easy to look up.

## What changes
- Users can turn on two-factor sign-in.
- BREAKING: security questions are removed.

## Capabilities
| capability | key | change | requirements |
|---|---|---|---|
| accounts | ACC | modified | +ACC-R3 -ACC-R4 |

## Artifacts
| artifact | decision | why |
|---|---|---|
| spec delta | included | always |
| design | skipped | one small screen, no new dependency |

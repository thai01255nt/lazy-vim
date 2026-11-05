# Notes — feat-password-reset

> Written by hitl-index (note add, note apply, /hitl:approve). Do not edit by hand.

## N-1 Token lifetime
- kind: design
- refs: D-1 (Store a hash of the reset token, never the token), T-13 (Set a new password)
- status: open
- from: user · 2026-11-05

The token must expire after 15 minutes.

<!-- hitl {"base":{"D-1":"a3650e9a2613"}} -->

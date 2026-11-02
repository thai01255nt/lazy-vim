# Project Goal
<!-- AUTO-GENERATED:BEGIN project-goal -->
A rate limiter for a public API gateway: each client has a token bucket; a request costs tokens and is refused when
the bucket runs dry. Success: fair use without refusing well-behaved clients.
<!-- AUTO-GENERATED:END project-goal -->

# Domain Logic
<!-- AUTO-GENERATED:BEGIN domain-logic -->
- A bucket never holds more than its capacity nor fewer than 0 tokens.
- A refused request changes nothing.
<!-- AUTO-GENERATED:END domain-logic -->

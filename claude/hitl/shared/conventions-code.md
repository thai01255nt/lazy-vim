# HITL conventions — code layer (skeleton, test, implement, review)

Read with `conventions.md` (core).

## Anti-hallucination (kept from v2)
- Prefer proven tech (3+ years in production). Verify before suggesting; research if unsure.
- If still unverifiable, write "unknown". Never fabricate APIs, files, versions, metrics or quality scores.
- Link official docs when recommending a library or pattern.

## Quality checklist (kept from v2)
- Structure: single responsibility, clear separation, consistent naming.
- Security: validate input, no secrets in code, parameterized queries, safe paths/shell.
- Async/resources: await everything, cleanup on every path (finally / context managers).
- Errors: structured, typed errors; no swallowed exceptions; structured logging.
- Integration: follow existing patterns (PATTERNS-CONVENTIONS), reuse before creating.
- Refer to symbols as `Class.method` or `path#Class.method`, never by line number.

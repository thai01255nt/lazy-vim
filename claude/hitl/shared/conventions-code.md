# HITL conventions — code layer (skeleton, test, implement, review)

Read with `conventions.md` (core).

## Quality checklist (kept from v2)
- Structure: single responsibility, clear separation, consistent naming.
- Security: validate input, no secrets in code, parameterized queries, safe paths/shell.
- Async/resources: await everything, cleanup on every path (finally / context managers).
- Errors: structured, typed errors; no swallowed exceptions; structured logging.
- Integration: follow existing patterns (PATTERNS-CONVENTIONS), reuse before creating.
- Tests and testable signatures: `shared/test-patterns.md` (also the code-layer terms seam, port, adapter, stand-in, fake;
  they never go into the domain glossary).

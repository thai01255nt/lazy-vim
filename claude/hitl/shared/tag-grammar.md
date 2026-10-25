# HITL tag grammar (human-readable copy of design §E.3.5)

Tags live in the symbol's docstring (JSDoc `/** */` in TS/JS, the docstring in Python).
The parser is `scripts/lib/tags.mjs`; this file is documentation only.

## Contents
1. Grammar
2. Rules
3. Tag meanings
4. Examples (TS function, Python function, TS test, Python test)

## 1. Grammar
```
doc        := line*
tag-line   := WS* "@" RESERVED value? ( WS+ "@" RESERVED value? )* WS*
RESERVED   := task | impl | status | prio | calls | concurrency | covers | ac | kind | origin | risk | dec
value      := text up to the next WS "@" RESERVED, or end of line, trimmed
task       := TASKID ("," WS* TASKID)*                      TASKID := "T-" [0-9]+
impl       := "agent" | "manual"
status     := "skeleton" | "wip" | "red" | "green" | "verified" | "done"
prio       := [0-9]+
calls      := REF ("," WS* REF)*                            REF := QualName | relpath "#" QualName
concurrency:= "none" | "shared-state" | "async" | "locks" | "io"
covers     := REF ("," WS* REF)*
ac         := ACID ("," WS* ACID)*                          ACID := TASKID ".AC" [0-9]+
kind       := "example" | "property" | "concurrency" | "golden" | "metamorphic"
origin     := "skeleton" | "test-author" | "human" | "agent-posthoc"
risk       := "low" | "high"                               (per-symbol override; rare)
dec        := DECID ("," WS* DECID)*                          DECID := "D-" [0-9]+
```

## 2. Rules
- A line is a tag-line only if **every** `@word` on it is reserved. Otherwise the whole line is prose.
  So `@param`, `@returns`, `@throws` lines stay in the intent. Never mix them with reserved tags on one line.
- Intent = prose lines (JSDoc `*` stripped, trimmed, blank runs collapsed). Intent + `@calls` + `@concurrency`
  are hashed into the locked contract; `@status`, `@prio`, `@impl`, `@task`, `@dec` are not.
- Invalid value → index warning `BAD_TAG`. Repeated list tags merge; a repeated scalar keeps the last value.
- `@status` is written by tooling only (`hitl-index status --sync-tags`). Skeletons start at `skeleton`.
- `@dec` is a list tag (items `D-n`; anything else → `BAD_TAG`). Optional, code symbols only (ignored on tests), typically
  0–3 per task. Adding/removing it never changes the intent hash and never needs re-approval. It resolves via the
  symbol's `@task` → the task's `← Planning:` file → the `D-n` row; an unknown D-n is a `DEC_UNKNOWN` block in `hitl-index trace`.
- Upgrade note: a docstring line that starts with `@dec …` used to be prose; it is now a tag (one-time `INTENT_CHANGED`).
- Refs: prefer the short form `UserRepo.findByEmail`; use `src/repo/userRepo.ts#UserRepo.findByEmail` only when ambiguous.

## 3. Tag meanings
| tag | on | meaning |
|---|---|---|
| `@task` | code | owning task(s) |
| `@impl` | code | who writes the body: `agent` or `manual` (human). Only the human flips it. |
| `@status` | code | computed lifecycle state (tooling) |
| `@prio` | code | implement order inside the task (1 = first) |
| `@calls` | code | declared collaborators; drift reports undeclared/missing calls |
| `@concurrency` | code | none / shared-state / async / locks / io; ≠ none adds a concurrency test stub |
| `@covers` | test | symbol(s) the test exercises |
| `@ac` | test | acceptance criteria ids the test proves |
| `@kind` | test | example / property / concurrency / golden / metamorphic |
| `@origin` | test | who wrote it: skeleton (stub) / test-author / human / agent-posthoc |
| `@risk` | code | rare per-symbol override of task risk |
| `@dec` | code | planning decision(s) `D-n` this symbol embodies (spec link; not hashed) |

## 4. Examples

TS function stub:
```ts
/**
 * Registers a user; rejects duplicate emails (case-insensitive).
 * @param email - user email, any case
 * @returns the saved user (without passwordHash)
 * @throws DuplicateEmailError when the email already exists
 * @task T-12 @impl agent @status skeleton @prio 1
 * @dec D-1
 * @calls UserRepo.findByEmail, UserRepo.save
 * @concurrency none
 */
```

Python function stub:
```py
def apply_discount(order: Order, pct: Decimal) -> Order:
    """Apply pct% discount once; total never negative.

    @task T-2 @impl manual @status skeleton @prio 2
    @calls round_money
    @concurrency none
    """
```

TS test stub:
```ts
/** @covers UserService.createUser @ac T-12.AC1 @kind example @origin skeleton */
it.todo("T-12.AC1 rejects duplicate email in any case");
```

Python test stub:
```py
@unittest.skip("TODO(test): T-2.AC1")
def test_T2_AC1_rejects_bad_pct(self):
    """@covers apply_discount @ac T-2.AC1 @kind example @origin skeleton"""
```

Wrong (mixed line → whole line becomes prose, tags lost):
```ts
 * @returns User @task T-12
```

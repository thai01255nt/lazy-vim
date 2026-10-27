# Decisions `D-n` (ADR / MADR)

Sources (references only): Michael Nygard, "Documenting Architecture Decisions" (2011) —
https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions · MADR 4.0.0 (2024-09-17; dual-licensed
MIT OR CC0-1.0) — https://adr.github.io/madr/. hitl keeps decisions inside `design.md` (one change = one decision log),
not one file per ADR.

## Two layers in `## Decisions`
1. **The log (required, parsed):** the table the CLI and trace read. Columns unchanged since 0.6.0.
   ```
   | id | decision | why | alternatives | cost if wrong | serves | status |
   ```
   `status` (MADR): `proposed` · `accepted` · `rejected` · `deprecated` · `superseded by D-n`. Only `accepted`
   decisions count for `REQ_NO_DEC` and `@dec`.
2. **The record (optional, MADR):** a `### D-n <title>` block after the table for every decision with ≥ 2 real
   options or a high cost if wrong:
   ```
   ### D-<n> <short title: problem and solution>
   - **Context and problem**: <the forces, one or two sentences; cite ## Context facts or requirement ids>
   - **Decision drivers**: <driver>, <driver>                    (optional)
   - **Considered options**: (1) <option> (2) <option> (3) <option>
   - **Decision outcome**: chosen (<n>), because <justification tied to the drivers>
   - **Consequences**: Good: <…>. Bad: <…>.
   - **Confirmation**: <how compliance is checked: test, review, fitness function>   (optional)
   - **More information**: <links>                               (optional)
   ```
   A pros/cons table may follow `Considered options` (tables below the first `### D-n` are never read as D rows).

## Immutability (Nygard)
An approved decision is never edited in place: add a new row `D-k`, set the old row to `superseded by D-k`, and add a
`## Changelog` line (`shared/amend-spec.md`). Status and `serves` live only in the table (one source of truth).

## Example
```
| D-1 | Store a hash of the reset token, never the token | leak-safe | plain token; signed token | account takeover | ACC-R5, ACC-BR1 | accepted |

### D-1 Store only a hash of reset tokens
- **Context and problem**: a leaked database must not let anyone reset passwords (ACC-R5, security).
- **Considered options**: (1) hash (SHA-256) of a random token (2) plain random token (3) signed, stateless token
- **Decision outcome**: chosen (1), because it is leak-safe and still single-use (ACC-BR1).
- **Consequences**: Good: a database leak exposes no usable link. Bad: lookups need the hash of the presented token.
```

## Warnings
`DESIGN_DEC_STATUS` (error, as before; new statuses accepted) · `DESIGN_DEC_SUPERSEDE_UNKNOWN` (target is not another
row) · `DESIGN_DEC_DETAIL_UNKNOWN` (`### D-n` without a table row, or a `###` that is not `D-n`) ·
`DESIGN_DEC_INCOMPLETE` (record misses Context and problem, Considered options, Decision outcome or Consequences).

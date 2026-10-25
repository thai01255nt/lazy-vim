# Slicing, priority, risk, ACs and test plan

Adapted from mattpocock/skills (MIT) — see NOTICE.md
Source: `skills/engineering/to-tickets/SKILL.md` @ 5c2cbbd5c3342a9ff4a80b7d8530759ca6a98c22 (vertical slices, blocking edges,
expand–contract, quiz). Changes: one tasks md per planning file instead of one file per ticket; adds HITL priority,
risk rules, symbol rows, impl owners, AC ids and test plan; consistency check idea from github/spec-kit `/analyze` (ideas only).

## Contents
1. Vertical slices
2. Wide refactors (expand–contract)
3. Blocking edges and priority
4. Risk rules
5. Acceptance criteria
6. Symbols and owners
7. Test plan
8. Consistency check (before the gate)
9. Quiz

## 1. Vertical slices
- Each task cuts a narrow but COMPLETE path through the layers it needs (types, service, API, tests): vertical, not one layer.
- A finished task is verifiable on its own (its ACs pass).
- Each task fits one fresh context window: as a rule of thumb ≤6 symbols and ≤3 files changed. Larger → split.
- Prefactor first: "make the change easy, then make the easy change". A prefactor task has no new behaviour, its ACs say
  "existing tests stay green" plus one AC for the seam it opens.
- Titles use the domain glossary (BUSINESS-CONTEXT) and say the behaviour, not the layer ("Register user with unique email", not "UserService").

## 2. Wide refactors (expand–contract)
One mechanical change with a wide blast radius (rename a column, retype a shared symbol) is not a vertical slice.
Sequence it: **expand** (add the new form beside the old) → **migrate** call sites in batches (per package/dir, each a task
blocked by expand) → **contract** (delete the old form, blocked by every migrate task). Mark all of them `risk: high (public-api)`.

## 3. Blocking edges and priority
- `blocked-by` lists only tasks that genuinely gate this one (it needs their symbols or behaviour). No edge "for order's sake".
- The frontier = tasks whose blockers are all done.
- Priority: **P0** blocks others or is the riskiest unknown (do it first to learn early) · **P1** core behaviour of the feature ·
  **P2** secondary paths, error polish · **P3** nice-to-have. Sort the file by prio, then dependency order.

## 4. Risk rules (deterministic; always list the reasons)
`high` if ANY of these hold, else `low`:
| reason tag | when |
|---|---|
| `core` | a target file matches `risk.corePaths` in `hitl.config.json` |
| `concurrency` | async shared state, locks, threads, timers, queues, caches written concurrently |
| `security` | auth, crypto, money, SQL, shell, file paths from input, deserialization, or a file under `risk.securityPaths` |
| `public-api` | change to an exported symbol used by other modules, HTTP/CLI contract, or package API |
| `domain` | introduces a new domain concept (new entity/aggregate/state machine) |
| `data` | data migration or persisted schema change |
Low-risk tasks may use the ⚡ fast lane (auto skeleton/tests approval). Never lower a risk to get the fast lane.
`quick` tasks follow the same rules; if a quick task comes out high, say so and recommend `/hitl:plan`.

## 5. Acceptance criteria
- 2–6 per task, id `T-n.ACk` (k from 1), Given/When/Then, one observable behaviour each, testable at a seam.
- Include at least one failure/edge AC when the task validates input or handles errors.
- Every active `must`/`should` R has ≥1 AC `(R-n)`; an AC instantiates one behaviour of its R concretely (Given/When/Then).
  `could` R may stay without AC. Never reference a deferred/dropped/superseded R. Quick tasks: no `(R-n)`.

## 6. Symbols and owners
- Row: `` n. [ ] `Ref` | new|modify | `path/file.ext` | impl: agent|manual | purpose ``. Order = implement order (callees first).
- `Ref` is `Name` or `Class.method` (no path; the file column carries it).
- `modify` only if the symbol exists now (`hitl-index context <ref> --json` or Grep); `new` only if it does not.
- File follows PATTERNS-CONVENTIONS (layer dir, naming). A `new` symbol in a file that does not exist yet → note
  `creates file` in purpose.
- Owner default `agent`. Recommend `manual` when the user said they will write it, or for core domain logic in a high-risk task.
- Meta `impl:` = `agent` / `manual` if all rows agree, else `mixed`.

## 7. Test plan
One row per AC (more rows allowed): `| AC1 | kind | oracle | seam | author |`.
- kind: `example` (default) · `property` (an invariant over many inputs) · `concurrency` (symbol has @concurrency ≠ none)
  · `golden` (stable output snapshot) · `metamorphic` (relation between two runs).
- oracle: where the expected value comes from — `spec` (the AC text), `invariant: <expr>`, `golden file`, `relation: <r>`. Never "the implementation".
- seam: the public symbol or endpoint the test calls (from the planning `## Test seams`).
- author: `test-author` (default) or `human`.

## 8. Consistency check (before the gate)
Structural checks (unknown/inactive R-n or D-n, R without AC, AC without R, unused D, R without serving D) come from
`hitl-index trace <planning> --json`; block items are fixed before the gate, warn/info items are listed there.
Add these semantic checks yourself, one line each, only when non-empty:
- planning `## Risks` items with no high-risk task covering them
- tasks touching items listed in `## Out of scope`
- symbols listed in two tasks (choose one owner task; the other is blocked-by it)

## 9. Quiz (the gate)
Present the table, then ask:
1. Granularity ok? (too coarse / too fine)
2. Blocking edges right? Does each task depend only on tasks that genuinely gate it?
3. Merge or split any task?
4. Owners (agent/manual) ok?
Iterate until the user replies Y.

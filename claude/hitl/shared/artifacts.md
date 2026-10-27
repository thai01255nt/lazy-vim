# Adaptive artifact selection (read by `/hitl:plan` and `/hitl:design`)

Which optional artifacts a change gets is decided per change, from evidence, not by a fixed template. Own text; the
artifact kinds come from BA practice (IIBA BABOK business rules / use cases, OMG DMN decision tables, ISO/IEC 25010
quality characteristics) and the spec-kit plan set (data-model, contracts) — ideas only, see NOTICE.md.
**Format of each artifact** (template, example, standard): `shared/formats/README.md` — write every artifact in that
format; `hitl-index spec validate` warns on the cheap-to-detect deviations.

**Evidence:** U = the user's words · S = spec content so far · C = code facts (spec-scout `.scout.json`, Explore).
**Audience:** (b) business-readable (no code names, file paths, libraries, SQL, HTTP verbs) · (a) dev only.

## 1. Table
| artifact | aud. | where | hard signal → include | soft signal → ask |
|---|---|---|---|---|
| spec delta | b | `specs/<cap>/spec.md` | always, unless type ∈ docs/chore/refactor/test/perf **and** U/C show no observable behaviour change (then proposal `## Capabilities` = "none (no behaviour change)") | — |
| glossary terms | b | `glossary.md` | a new domain noun is used in a requirement; two words for one concept | a term used differently than in `specs/GLOSSARY.md` |
| business rules | b | `### Rule:` in the delta | a policy (eligibility, limit, threshold, pricing, permission) shared by ≥ 2 requirements | a single conditional policy |
| decision table | b | inside a Rule (DMN: `Hit policy:` + `(in)`/`(out)` columns) | ≥ 2 interacting conditions decide one outcome | numeric thresholds only |
| use-case flow | b | `### Flow:` in the delta (Cockburn lite) | ≥ 2 actors handing off, or ≥ 4 steps with an alternate path | 3 steps |
| business lifecycle | b | a `### Rule:` with `stateDiagram-v2` + `from \| event \| guard \| action \| to` table | an entity users see with ≥ 3 states, or a guarded/irreversible transition ("cannot be reopened") | 2 states; a status field named by the user |
| NFR | b | requirement + `Quality: <ISO 25010:2023 characteristic>` + `Fit: <measurable criterion>` | U names speed, availability, privacy, security, compliance, accessibility, or a number | risk tag security/perf from C |
| unchanged behaviour | b | proposal `## Unchanged behaviour` | type fix/refactor/perf | — |
| design.md | a | `design.md` | anything outside the skip conditions (§3) | — |
| data-model | a | `data-model.md` | a new or changed persisted entity/field; migration | a new in-memory shape shared by ≥ 2 components |
| contracts | a | `contracts/*` — HTTP: OpenAPI 3.1 · events/queues: AsyncAPI 3 · payload/file: JSON Schema 2020-12 · CLI: md | a new or changed external interface (HTTP, CLI, event, public package API, file format) | an internal module boundary used by other teams |
| decision records | a | `design.md ### D-n` (MADR) under the D table | a decision with ≥ 2 real options, or `cost if wrong` = data loss, security, money, public API | any other non-obvious decision |
| architecture (C4) | a | `design.md ## Architecture (C4)` (Context/Container) | a new external system, container, data store or trust boundary | a new deployable inside an existing system |
| technical state machine | a | `design.md ## State machines` | an internal process with ≥ 3 states, retries or timeouts (job, saga, connection) | 2 states |
| sequence | a | `design.md ## Flow / sequence` | ≥ 3 components or async messaging | 2 components with retries |
| migration/rollout | a | `design.md ## Migration / rollout` | data backfill, expand–contract, feature flag | — |
| research notes | a | `design.md ## Context` | a library/tech choice with alternatives the repo does not use yet | — |

Plan decides the (b) rows and `design.md` (include / skip). Design decides the other (a) rows.
Lifecycle: a business lifecycle (b) is what users see (order placed → paid → shipped); internal states (retry, lock,
connection) are a technical state machine (a). When a lifecycle exists, every state name used in a requirement is a
glossary term.

## 2. Confidence rule
- **High → act, no question**: (a) any hard signal → include; (b) no signal from U, S or C → skip; (c) U explicitly
  excludes it → skip. Print one line each time and record the row as `assumed → included|skipped`:
  `💡 Assumed: include decision table for ACC-BR1 (2 interacting conditions)` ·
  `💡 Assumed: skip use-case flow (single actor, 2 steps)`.
- **Uncertain → ask** as `[A]` in the next round, with a recommendation (max 2 `[A]` per round), and record
  `asked → included|skipped`, when: only a soft signal; or signals conflict (U says "simple", C shows a persisted
  change); or the artifact is security/data-related and its evidence is soft (skipping it costs more).
- Never ask about an artifact with no signal. Re-evaluate every round; new evidence can add one
  (`💡 Added artifact: …`). The user may type `add <artifact>` / `drop <artifact>` at any gate.

`[A]` wording:
```
❓ **Q3** [A] - **Business rule for reset limits?**: You said "not too many resets". Should this be a named business
rule with a number (e.g. "max 3 reset requests per hour per account"), visible to BA/QA?
💡 Recommended: yes — ACC-BR2 "max 3 requests / hour / account" (abuse protection; testable)
```

## 3. Skipping design
Design is skipped only when **all** hold: no new external dependency, no persisted-data change, no public interface
change, ≤ 2 tasks expected, no `high` risk signal (security, concurrency, money, data). Record
`| design | skipped | <why> |` (`assumed` when confident, else ask `[A]`). Then `/hitl:tasks` runs straight from the spec.

## 4. Recording
Proposal `## Artifacts` table: `| artifact | decision | why |`, decision ∈ `included | skipped | assumed → included |
assumed → skipped | asked → included | asked → skipped` (the CLI reads the `design` row: a decision containing
`skipped` means design is skipped). Design adds its own rows to the same table (data-model, contracts, sequence,
migration/rollout).

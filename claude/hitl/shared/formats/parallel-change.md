# Parallel change for merged or released behaviour (hitl 0.18)

Used when an amend brief's transition answer is `merged` or `released` (`shared/amend-spec.md`, `shared/task-changes.md`
§3): the old behaviour lives outside the branch, so other code, stored data, clients or other services may depend on
it. The amend task set then changes it in four steps — **expand** (add the new form beside the old one) → **migrate**
(move callers and stored data) → **switch** (the new behaviour is the one in use) → **contract** (remove the old form
and every temporary item) — so each deploy works on its own. Read this file when you write those tasks. An in-branch
amendment (`branch`) does not use it: prep → switch → contract, no temporary items, no deploy groups.

Ideas adapted (no text copied): Martin Fowler, "Parallel Change" and "Branch By Abstraction"; Pete Hodgson, "Feature
Toggles" (release toggles are short-lived; plan the removal when the toggle is added); Stripe, "Online migrations at
scale" and Prisma, "Expand and contract pattern" (dual write → backfill → switch reads → stop the old writes → drop);
Fowler, "Tolerant Reader"; IETF RFC 8594 (`Sunset` header) and RFC 9745 (`Deprecation` header). See NOTICE.md.

Terms:
- **temporary item** — something an amend task adds only so the old and the new form can live side by side, and that
  a contract task removes: the old form kept alive, a dual write, a backfill job, a feature flag, a compatibility shim
  (adapter, alias, fallback branch), an old API version, a dual-published event.
- **deploy group** — the tasks that ship in the same deploy (release). Group 1 ships first.

## 1. Markers in tasks.md

| marker | where | meaning |
| --- | --- | --- |
| `**Temp**: <name> (<type>) — <what>` | a line under the meta line of the task that adds the item (one line per item; usually an `expand` task) | the item is temporary; `<name>` is a short id (`dual-write-expiry`, `flag-reset-ttl`, a symbol name) |
| `**Removes**: <name>, <name>` | a line under the meta line of a `contract` task | the contract task removes these temporary items |
| `deploy: <n>` | meta line, after `kind:` | the deploy group of the task (a task without it is group 1) |

Types: `data` (column, table, dual write, backfill state), `api` (old version, optional field, old endpoint), `event`
(old message format, dual publish), `flag` (feature flag and its config key), `shim` (compatibility code: adapter,
alias, fallback branch, tolerant reader of the old format). Removing a `data`, `api` or `event` item needs a later
deploy group than the task that added it (§4). A `remove` row in `### Symbols` also removes a temporary item whose
name is that symbol.

```
## PWR-T7 Store the link expiry as a timestamp

- prio: P1 | risk: high (data) | impl: agent | blocked-by: none | amend: PWR-A2 | kind: expand | deploy: 1 | status: todo

**Temp**: dual-write-expiry (data) — writes expires_at and ttl_hours both
**Temp**: ttl-hours-column (data) — the old column, read until the switch

## PWR-T10 Drop the hour-based expiry

- prio: P2 | risk: high (data) | impl: agent | blocked-by: PWR-T9 | amend: PWR-A2 | kind: contract | deploy: 3 | status: todo

**Removes**: dual-write-expiry, ttl-hours-column
```

## 2. Patterns

Each pattern lists the tasks in order, what each task's ACs say, and its test decisions (the `### Test plan` cell,
`shared/test-patterns.md`). Titles and ACs are in business words where the task has a spec ref; a cleanup task's ACs
may name code (`trace` gives `AC_NO_REQ` only as info).

### 2.1 Schema or stored-data change

| # | kind | deploy | the task | ACs | test decisions |
| --- | --- | --- | --- | --- | --- |
| 1 | expand | 1 | add the new structure (nullable column, new table) and write both the old and the new one (dual write). `**Temp**:` the dual write and the old structure | "Given a new reset When it is stored Then both forms hold the same expiry"; "existing tests stay green" | `new:` on the repository seam (both forms written); `covered:` for the existing behaviour |
| 2 | migrate | 1 | backfill the rows written before the expand: batched, idempotent, resumable | "Given rows with only the old form When the backfill runs twice Then every row has the new form and the second run changes nothing" | `new:` a backfill test on a **copy of real-shaped data** (a fixture with the edge rows: empty, maximum, other time zone, soft-deleted), run twice; never on production data |
| 3 | switch | 2 | read the new structure (the spec's new behaviour; often behind a flag, §2.3) | the spec ACs of the amendment | `rewrite:` the locked tests of the old behaviour; `new:` reads come from the new form |
| 4 | contract | 3 | stop the dual write, then drop the old structure in a later deploy than the expand. `**Removes**:` both temporary items; `remove` rows for the dual-write code | "Given the schema after this deploy Then the old column does not exist"; "no code writes the old form" | `new:` a test that the old path is gone (schema assert, or the repository has no write of the old form); `risk: high (data)` |

Never drop data in the deploy that stops writing it: the running previous version still writes and reads it until the
deploy finishes.

### 2.2 API or contract change

| # | kind | deploy | the task | ACs | test decisions |
| --- | --- | --- | --- | --- | --- |
| 1 | expand | 1 | add the new version, or the new field as optional; the old one keeps working. `**Temp**:` the old version (api) | "Given a v2 request When … Then …"; "Given a v1 request Then the response is unchanged" | `new:` on the new version; a `@kind regression` test that keeps v1 as it is |
| 2 | migrate | 1 | move every internal caller and known consumer to the new version; mark the old one deprecated (`Deprecation` and `Sunset` response headers, a changelog entry, a note to the consumers) | "each internal caller uses v2"; "a v1 response carries Deprecation and Sunset" | `new:` one test per moved caller (or a consumer contract test); a header test |
| 3 | switch | 1 or 2 | make the new version the default (docs, SDK, the default route) | the spec ACs | `rewrite:` of the old-behaviour tests |
| 4 | contract | after the window | remove the old version after the deprecation window the brief states ("after release N", or a date). `**Removes**:` the old version; `remove` rows | "Given a v1 request Then the response is 410 Gone" (or the route does not exist) | `new:` a test that the old path is gone; the v1 regression test is deleted (`rewrite:` row → deleted) |

### 2.3 Behaviour behind a feature flag

| # | kind | deploy | the task | ACs | test decisions |
| --- | --- | --- | --- | --- | --- |
| 1 | expand | 1 | add the flag (default off) and the new path behind it. `**Temp**:` the flag (flag) and the old branch (shim) | "Given the flag off Then the old behaviour holds"; "Given the flag on Then the new behaviour holds" | `new:` per flag value on the decision seam |
| 2 | switch | 1 or 2 | roll out: the flag on by default (or for everyone) | "Given the default configuration Then the new behaviour holds" | `rewrite:` the old-behaviour tests to flag-on |
| 3 | contract | 2 or later | remove the flag, its config key and the old branch. `**Removes**:` both | "no configuration reads the flag"; "the old behaviour is not reachable" | the flag-off tests are deleted; `new:` the config key is unknown (or a code search assert) |

A release flag is short-lived: the contract task is written together with the expand, never "later".

### 2.4 Event or message format change

| # | kind | deploy | the task | ACs | test decisions |
| --- | --- | --- | --- | --- | --- |
| 1 | expand | 1 | consumers accept both formats (tolerant reader); then the producer publishes both, or the new one with a version field. `**Temp**:` the dual publish (event), the old-format reader (shim) | "Given a v1 or a v2 message When it is consumed Then the effect is the same" | `new:` a consumer test on a recorded, real-shaped v1 message and on a v2 message |
| 2 | migrate | 1 or 2 | move every consumer to the v2 fields; upcast or replay stored events when there is an event store | "each consumer reads the v2 fields"; "stored v1 events upcast to v2" | `new:` an upcast test on a copy of real-shaped stored events |
| 3 | switch | 2 | the producer's v2 message is the source of truth | the spec ACs | `rewrite:` of the old-behaviour tests |
| 4 | contract | 3 | stop publishing v1 after every consumer moved and the retention window of the topic passed; remove the v1 reader. `**Removes**:` both | "only v2 is published"; "no consumer reads v1" | `new:` the producer emits no v1 message; the v1 reader's tests are deleted |

## 3. Deploy groups and the checks

| code | rule (only for `merged` and `released` amend sets) |
| --- | --- |
| `AMEND_TEMP_NO_REMOVAL` | every `expand` names at least one `**Temp**:` item; every temporary item is removed by a `contract` task of the same amendment (`**Removes**:` or a `remove` row); every `**Removes**:` name is a temporary item of the set |
| `AMEND_CONTRACT_SAME_DEPLOY` | a contract that removes a `data`, `api` or `event` item has a higher `deploy:` than the task that added it; with `released` the contract must name its `deploy:` |
| `AMEND_ORDER` | (0.17) a later kind is blocked by every earlier kind; (0.18) a contract of a merged or released set never has `blocked-by: none`; a task's `deploy:` is never lower than the `deploy:` of a task it is blocked by |

`hitl-index tasks --check` and `hitl-index amend check <id>` run them. In-branch sets: none of these temp rules.

## 4. Questions the amend brief asks for merged or released behaviour

Asked once the transition answer is `merged` or `released` (round 1 when the description already says so, else the
next round), each with `_Rec:_`:
1. `[D]` Who depends on the old form? Consumers of the API or events, stored data, other services, scheduled jobs,
   reports. `_Rec:_` the callers the dependency pass found (`### Reached through calls`) plus what the code cannot show
   (other services, stored data).
2. `[D]` The deprecation window: how long the old form keeps working (a release count or a date), and who is told.
   `_Rec:_` one release for in-house callers; for external consumers the window their contract states.
3. `[D]` A feature flag for the switch? `_Rec:_` yes when the new behaviour is risky or needs a gradual rollout; no for
   a pure rename or an additive field.

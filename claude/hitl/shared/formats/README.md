# Standard formats (hitl 0.6.1)

Each artifact follows a published standard, cut down to what a change needs. Own text: the standards are cited as
references only (no text copied) — see NOTICE.md §2. Every check below is a `spec validate` **warning**, never an error.

| artifact | where | aud. | standard (version) | file |
|---|---|---|---|---|
| requirement statement + quality | `### Requirement:` | b | ISO/IEC/IEEE 29148:2018 · INCOSE GtWR v4 (2023) · EARS | [requirement-quality.md](requirement-quality.md) |
| NFR | `Quality:` + `Fit:` lines | b | ISO/IEC 25010:2023 · Volere fit criterion | [requirement-quality.md](requirement-quality.md) |
| decision table | inside `### Rule:` | b | OMG DMN 1.6 (decision table, hit policy) | [decision-tables.md](decision-tables.md) |
| lifecycle / state machine | `### Rule:` (b) or design `## State machines` (a) | b/a | Mermaid `stateDiagram-v2` + UML-style transition table | [state-machines.md](state-machines.md) |
| use case | `### Flow:` | b | Cockburn, *Writing Effective Use Cases* — fully dressed (lite) | [use-cases.md](use-cases.md) |
| decision `D-n` | design `## Decisions` | a | Nygard ADR (2011) · MADR 4.0.0 | [decisions.md](decisions.md) |
| contract | `contracts/*` | a | OpenAPI 3.1.1 (3.2 accepted) · AsyncAPI 3.0 · JSON Schema 2020-12 · CLI (md) | [contracts.md](contracts.md) |
| architecture diagram | design `## Architecture (C4)` | a | C4 model (Context, Container) via Mermaid `C4Context` | [architecture-c4.md](architecture-c4.md) |

Keywords and markers stay English in every language (`SHALL`, `Hit policy:`, `(in)`/`(out)`, `from | event | guard |
action | to`, `Primary actor:`, `**Decision outcome**`); prose may be any language.
Implementation: `scripts/lib/speclint.mjs` (pure, zero-dependency); design decisions in `scripts/lib/specmd.mjs`.

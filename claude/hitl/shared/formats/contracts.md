# Contracts (`changes/<id>/contracts/*`, dev only)

Sources (references only): OpenAPI Specification 3.1.1 — https://spec.openapis.org/oas/v3.1.1.html (3.2.x, published
2025, is also accepted) · AsyncAPI 3.0.0 — https://www.asyncapi.com/docs/reference/specification/v3.0.0 (any 3.x
accepted) · JSON Schema 2020-12 — https://json-schema.org/draft/2020-12 (`$schema`
`https://json-schema.org/draft/2020-12/schema`) · CLI contract: hitl's own md template (conventions from POSIX utility
syntax guidelines and `sysexits.h` exit codes as references).

| boundary | file | template |
|---|---|---|
| HTTP API | `contracts/<name>.openapi.yaml` (or `.json`) | `shared/templates/contracts/openapi.yaml` |
| events / queues | `contracts/<name>.asyncapi.yaml` | `shared/templates/contracts/asyncapi.yaml` |
| payload / file format | `contracts/<name>.schema.json` | `shared/templates/contracts/schema.json` |
| command line | `contracts/cli-<name>.md` (`# CLI: <command>`) | `shared/templates/contracts/cli.md` |
| other (email, public package API) | `contracts/<name>.md` | free form: inputs, outputs, errors, versioning |

Rules: only the boundary the change adds or changes (minimal skeleton, no full API dump); every file listed in
design.md `## Contracts` as `- contracts/<file> — <boundary>`; payload schemas are shared by `$ref` from OpenAPI and
AsyncAPI (OpenAPI 3.1+ and AsyncAPI 3 both accept JSON Schema 2020-12 payloads).

## `spec validate` (structural only, zero-dependency; warnings)
- `.json`: must parse (`CONTRACT_PARSE`). With `openapi`/`asyncapi`: version + `info` checked like YAML. A JSON Schema
  (`type`/`properties`/`$defs`, or `*.schema.json`) needs `$schema` 2020-12 (`CONTRACT_VERSION`).
- `.yaml`/`.yml`: no YAML parser — only top-level keys: `openapi: 3.1.x|3.2.x` (`swagger: 2.0` and `3.0.x` warn),
  `asyncapi: 3.x` (2.x warns), a top-level `info` (`CONTRACT_STRUCTURE`), OpenAPI needs `paths`, `webhooks` or
  `components`; a file with `paths:` but no `openapi:` (or `channels:` but no `asyncapi:`) → `CONTRACT_VERSION`.
- CLI md (`# CLI: …` or `cli` in the name): `## Synopsis` (or Usage) and `## Exit codes` (`CONTRACT_STRUCTURE`).
- Full validation (spectral, asyncapi-cli, a JSON Schema validator) is the project's own CI, if any.

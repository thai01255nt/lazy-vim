# Security lens + full audit (hitl glue for the vendored `hitl:security-audit`)

Upstream method: `${CLAUDE_PLUGIN_ROOT}/skills/security-audit/` (cloudflare/security-audit-skill, MIT, vendored
unmodified — see its `UPSTREAM.md`). This file only maps it onto hitl; never edit the upstream files.
`SA = ${CLAUDE_PLUGIN_ROOT}/skills/security-audit`.

## Contents
1. When the security lens runs
2. Lens method (guidance mode, per task)
3. Verdict → hitl finding mapping
4. Full audit (`/hitl:review --security-audit`)

## 1. When the security lens runs

`hitl-index risk <T> --json` lists `security` (securityPaths, features sql/shell/crypto/eval/deserialize/fs-path, a task
risk reason `security…` such as `risk: high (security)`, or a human override, which selects all four lenses), **or**
the task crosses a trust boundary the index cannot see: authN/authZ, parsing untrusted input, crypto, secrets, file /
IPC / network I/O, LLM prompts or tool calls, deserialization, multi-tenant data. Judge the second case from the task
title, ACs, risk reasons and planning `## Risks` (a `security:` line names the boundaries) and say
`💡 Assumed: security lens (trust boundary: <x>)`.

## 2. Lens method (guidance mode, per task)

Upstream guidance mode only: no six phases, no output directory, no audit artifacts. The reviewer stays on the crafted
context (review context, l0.json, these files) and the task's code.

1. Read `SA/SKILL.md` sections **Universal execution safety** and **Core principles**, then the parts of
   `SA/ATTACK-CLASSES.md` that fit the task (**Injection**, **Access control**, **Resource and file handling**,
   **Cryptography and secrets**, **Business logic**, **Obvious things** are the usual ones).
2. Pick companion files by what the task's code actually does (their "When to use this file" section decides; not
   language or dependency names). For each picked file read its `Core discipline`, the matching class blocks, and
   `Validation rules`:

   | Task code … | Companion |
   |---|---|
   | HTTP handlers, sessions, cookies, JWT/OAuth/OIDC/SAML, API keys, MFA, password reset | `WEB-PROTOCOL-AND-AUTH.md` |
   | renders into a DOM, postMessage, browser storage, service workers, extensions | `CLIENT-SIDE.md` |
   | builds prompts, calls a model, dispatches tools, MCP, RAG, agent memory | `AI-AND-LLM.md` |
   | native code, `unsafe`, FFI, binary parsers/decoders, kernel, loaders | `MEMORY-SAFETY-AND-BINARY.md` |
   | gRPC/GraphQL/Protobuf/custom wire protocols, webhooks, queues, pub/sub | `PROTOCOLS-RPC-AND-MESSAGING.md` |
   | tenant-scoped data, caches/search/exports/backups, deletion/retention | `DATA-ISOLATION-AND-LIFECYCLE.md` |
   | unbounded work per request: CPU, memory, disk, connections, paid APIs | `RESOURCE-EXHAUSTION-AND-AVAILABILITY.md` |
   | dependency resolution, CI, release, signing, updaters, plugins | `SUPPLY-CHAIN-AND-RELEASE.md` |
   | IAM, IaC, containers, serverless, ingress, runtime config | `CLOUD-AND-DEPLOYMENT.md` |
   | desktop/mobile apps, deep links, webview bridges, local daemons/IPC | `DESKTOP-MOBILE-AND-LOCAL-IPC.md` |

   Record the picked companions in the summary `notes` and the considered-but-not-picked ones in `setAside`.
3. Apply the upstream principles to every candidate:
   - name the lower-trust principal, the accepted input/action, the intended control, the crossed boundary and the
     affected principal/resource. No concrete boundary failure → not a finding.
   - defense-in-depth gaps (layer A already prevents it; layer B is missing) and checklist deviations are hardening
     notes → `setAside`, never findings.
   - severity = likelihood × impact of the demonstrated path, never above the demonstrated impact.
   - a source-grounded lead blocked on a fact outside source (deployment, proxy, provider, identity policy, runtime) →
     `needs_validation` with the exact missing fact; do not guess either way.
4. **Never execute target code** beyond hitl's existing gates (`hitl-index test` runs the project's own suite;
   reviewers may only re-run it). No ad-hoc harnesses, fixtures, fuzzers, network probes. Upstream allows target
   execution only inside an OS-enforced sandbox (no network, allowlisted env, read-only target, resource limits);
   hitl does not provide one, so anything that would need a run stays `needs_validation` with a safe validation plan.

## 3. Verdict → hitl finding mapping (`hitl.findings/1`, category `security`)

| Upstream verdict | hitl finding |
|---|---|
| `confirmed` (complete source trace + bounded result) | normal finding, `"verdict": "confirmed"`. severity: critical/high → `critical`, medium → `important`, low/informational → `minor`. The finding-verifier re-scores it like any finding. |
| `needs_validation` | `"verdict": "needs_validation"`, `"severity": "important"` (routing only — upstream gives it no severity), `"fixOwner": "human"`, `"blocker": "<exact unresolved fact>"`, `suggestedFix` = the safe validation plan. Kept → a `needs_validation` card for the human. |
| `rejected` | not written; one `setAside` line with the disproving fact. |

`evidence` for security findings: `principal → input → control → boundary → result`, with file:line per hop.

## 4. Full audit (`/hitl:review --security-audit [<planning|tasks file>|repo] [--out <dir>] [--profile quick|standard|deep]`)

Runs the complete upstream six-phase workflow (full audit mode). Suggest-only from other skills; never auto-run.

1. **Scope.**
   - feature file → `hitl-index feature <file> --json` for the task ids, then `hitl-index risk <T> --json` per task:
     the files of the symbol ids (`path#…`) are `scope_paths` (an upstream *scoped run*; it reports partial coverage).
   - `repo` or empty → the whole project root.
2. **Output dir**: `--out <dir>` if given, else upstream's default `~/security-audit-skill/<repo-name>/run-<N>` (outside the
   target). A dir inside the project is allowed only if the user picked it and git ignores it (upstream rule).
3. **Run**: invoke the Skill `hitl:security-audit` with an explicit full-audit request:
   `Full audit mode. Target: <abs project root>. Scope paths: <list|whole repo>. Profile: <profile, default standard>.
   Output directory: <dir>. Skill directory: ${CLAUDE_PLUGIN_ROOT}/skills/security-audit.`
   Then follow it to its terminal state. Upstream `research` agents = `Explore` subagents, `general` agents =
   `general-purpose` subagents (never hitl:reviewer/implementer — their hooks are for task review). Validators:
   `node ${CLAUDE_PLUGIN_ROOT}/skills/security-audit/validate-findings.cjs <dir>/findings.json` and
   `node ${CLAUDE_PLUGIN_ROOT}/skills/security-audit/validate-coverage-ledger.cjs <dir>/coverage-ledger.json`.
   No OS sandbox available → upstream keeps every lead that would need a run as `needs_validation`; say so in one line.
4. **Link** (feature context only): `hitl-index feature <file> --report --security-audit <dir> --json` records
   `<dir>/REPORT.md` and regenerates `reviews/feature-<name>.md` with a `## Security audit` section.
5. **Print**: the counts by verdict from `<dir>/findings.json`, the REPORT.md path, and for each `confirmed` record the
   file and the one-line title. The audit never edits target source; fixes go through `/hitl:review <T> fix` or a new
   task (`/hitl:tasks`).

# Jira — plan payload → tool parameters

Server: Atlassian remote MCP `https://mcp.atlassian.com/v1/mcp`, one OAuth per site (`<name>.atlassian.net`); several
sites → one server per site, each repo pins one with `jira.server`. Tool names are runtime-only: discover them
(`connect.md`), never hardcode. Most calls also take the run's `cloudId`.

Match by meaning; if the schema names the same thing differently, use its name. Ignore `labelIds` (same names as
`labels`), `priority` (hitl's number; `priorityName` carries it), `stateType`, `expect` and `meta`.

| plan field | Jira | notes |
|---|---|---|
| `teamId` | the project: its **id** (numeric, init `team.id`) | a tool that wants the key (`projectKey`) → send status `team` (= `jira.team`, e.g. `PAY`) |
| `title` | `summary` | |
| `description` | `description` | markdown byte-for-byte; a tool that takes ADF only → convert headings / bullets / the marker comment faithfully and report `description` as returned |
| `issueType` | issue type name (`issueTypeName`) | tasks `jira.issueType` (Task); epics `jira.epicType` (Epic) |
| `priorityName` | `priority: {name}` (via `additional_fields` / `fields` when no direct parameter) | |
| `labels` | `labels: [names]` | free text (no spaces); **replaces** the set on edit → merge with remote (`push-ops.md`) |
| `stateId` | not a field: a **transition** | `getTransitionsForJiraIssue` → the transition whose target status id = `stateId` → `transitionJiraIssue`; none → `skippedFields: ["stateId"]` |
| `parentId` | `parent: {id}` (or `{key}`) | epic or parent issue of the change |
| `projectId` | `parent: {id}` too | a pinned epic (`jira.project`); never edit that epic |
| `blockedBy` | issue link type **Blocks** (this issue is the *inward* "is blocked by") | no link tool → `skippedFields: ["blockedBy"]` + `📌` note |
| comment `body` | `commentBody` | create only (no update tool) → report the new `commentId` |

Results to extract: `id` (numeric, as a string), `key` → `issue` (e.g. `PAY-12`), `url` = `https://<site>/browse/<key>`
(build it from the site when the tool returns `self` API links only), `description` as stored when returned.
No branch name in Jira: omit `branch` (the CLI builds `<project>-<n>-<slug>`).

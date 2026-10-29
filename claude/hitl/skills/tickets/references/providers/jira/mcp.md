# Jira — MCP discovery and parameter mapping (for /hitl:tickets)

Server: Atlassian's remote MCP server (Rovo MCP), `https://mcp.atlassian.com/v1/mcp` (Streamable HTTP; the older `/v1/sse`
endpoint may still be listed), OAuth per Atlassian **site** (`<name>.atlassian.net`). Claude Code:
`claude mcp add --transport http atlassian https://mcp.atlassian.com/v1/mcp`, then `/mcp` to authenticate.
Several sites → one server per site with distinct names; each repo pins one with `jira.server`.
**Tool names are published at runtime only** — discover, never hardcode. Names seen on the Atlassian server (not
authoritative): `getAccessibleAtlassianResources`, `atlassianUserInfo`, `getVisibleJiraProjects`,
`getJiraProjectIssueTypesMetadata`, `createJiraIssue`, `editJiraIssue`, `getJiraIssue`, `searchJiraIssuesUsingJql`,
`getTransitionsForJiraIssue`, `transitionJiraIssue`, `addCommentToJiraIssue`, `getJiraIssueRemoteIssueLinks`.
Most calls also need the site's `cloudId` (from `getAccessibleAtlassianResources`): keep it for the whole run.

## 1. Discover
1. Tool names matching `mcp__<server>__…` where `<server>` contains `atlassian` or `jira` (case-insensitive). Deferred →
   `ToolSearch` `+atlassian jira issue`, `+atlassian transition`, then `select:` the ones you need.
2. Server choice is the CLI's (`hitl-index tickets server <server>… [--init] --json`): the pinned `jira.server` is the
   only prefix used. Then verify the identity (`connect.md` §1b) before any write.
3. Before the first call of each tool, read its input schema. Never guess a parameter the schema does not list.

## 2. Plan payload → tool parameters
| plan field | Jira | notes |
|---|---|---|
| `teamId` | project key/id (`projectKey`) | the Jira project (`jira.team`) |
| `title` | `summary` | |
| `description` | `description` | send the markdown byte-for-byte; when the tool takes ADF only, convert headings/bullets/marker comment faithfully and report `description` as returned |
| `issueType` | issue type name (`issueTypeName`) | `jira.issueType` (Task); epics `jira.epicType` (Epic) |
| `priorityName` | `priority: {name}` (via `additional_fields`/`fields` when no direct param) | `priority` (1–4) is hitl's number; send the name |
| `labels` | `labels: [names]` | Jira labels are free text (no spaces); **replaces** the set on edit → merge with remote |
| `stateId` | not a field: a **transition** | `getTransitionsForJiraIssue` → the transition whose target status id = `stateId` → `transitionJiraIssue`; none → `skippedFields: ["stateId"]` |
| `parentId` | `parent: {id}` (or `{key}`) | epic or parent issue of the change |
| `projectId` | `parent: {id}` too | a pinned epic (`jira.project`) arrives as `projectId`; never edit that epic |
| `blockedBy` | issue link type **Blocks** (this issue is the *inward* "is blocked by") | first existing link tool (`createJiraIssueLink`, `linkJiraIssues`, …); none → `skippedFields: ["blockedBy"]` and `📌 link <issue> is blocked by <others> by hand` |
| comment `body` | `commentBody` | create only (no update tool) → report the new `commentId` |

Results to extract: `id` (numeric), `key` → result `issue` (e.g. `PAY-12`), `url` = `https://<site>/browse/<key>`
(build it from the site when the tool returns `self` API links only), `description` as stored when returned.
No branch name in Jira: omit `branch` (the CLI builds `<project>-<n>-<slug>`).

## 3. Errors
Same as Linear: missing tool / 401 / 403 / auth → unreachable, stop and queue; network / timeout / 429 → unreachable;
a validation error on one op (bad field, transition not allowed from the current status) → that op `ok:false`, continue.

# Linear MCP — discovery and parameter mapping (for /hitl:tickets)

Verified 2026-10-25. Linear's official docs (https://linear.app/docs/mcp) document the server, not its tool list:
- Endpoint `https://mcp.linear.app/mcp` (Streamable HTTP, read-write); `https://mcp.linear.app/mcp/readonly` exposes only
  read tools; `/sse` is deprecated and was removed (https://linear.app/changelog/2026-02-05-linear-mcp-for-product-management).
- Auth: OAuth 2.1 with dynamic client registration (interactive, `/mcp` in Claude Code), or an
  `Authorization: Bearer <token>` header with an OAuth token or a Linear API key. A read-only key or the `read` scope gives
  read-only tools: then every write fails → hitl queues the ops (fail-open).
- Claude Code: `claude mcp add --transport http linear-server https://mcp.linear.app/mcp`, or the official `linear`
  plugin (it only contains that `.mcp.json`). Do not configure both for the same workspace: duplicate servers give
  duplicate tool names. Several workspaces → one server per workspace with distinct names
  (`claude mcp add --transport http linear-work https://mcp.linear.app/mcp`, `… linear-personal …`), each authenticated
  in `/mcp`; each repo pins one with `linear.server`.
- **Tool names are published at runtime only** (`tools/list`) and have changed over time: older servers had
  `create_issue`/`update_issue`; the 2026 server uses upserts such as `save_issue` (create without `id`, update with
  `id`). Third-party listings (not authoritative) show `list_issues, get_issue, save_issue, list_teams, list_cycles,
  list_comments, create_comment, list_projects, get_project, list_issue_statuses, list_issue_labels`; others mention
  `save_comment`, `save_project`, `create_issue_label`. Hence: discover, never hardcode.

## 1. Discover
1. Collect the tool names you can call that match `mcp__<server>__<tool>` where `<server>` contains `linear`
   (case-insensitive): `mcp__linear-server__…`, `mcp__linear__…`, `mcp__plugin_linear_linear__…`, `mcp__claude_ai_Linear__…`.
2. Deferred tools (only names visible): `ToolSearch` query `+linear issue`, then `+linear team`, `+linear label`,
   `+linear comment`, `+linear project` as needed; load the chosen ones with `select:<full name>,…`.
3. Server choice is the CLI's (`hitl-index tickets server <server>… [--init] --json`, SKILL.md §1): a pinned
   `linear.server` is the only prefix used; it is missing → `❌` + `claude mcp add --transport http <name>
   https://mcp.linear.app/mcp` + `/mcp`, queue (push) — never another server. Several servers are normal: one per
   workspace (one OAuth each), e.g. `linear-work`, `linear-personal`. Legacy configs without `linear.server` only: use
   the server whose `list_teams` contains the mapped team id, and suggest pinning. Use only that prefix for the whole run.
   Then verify the identity (SKILL.md §1b) before any write: team ids are workspace-unique uuids, the workspace urlKey
   is the first path segment of any `https://linear.app/<urlKey>/…` URL.
4. Pick per capability the first existing suffix (table in SKILL.md §1). Note which one you chose in the final report
   only when it was a fallback (e.g. `create_issue` instead of `save_issue`).
5. Before the first call of each tool, read its input schema (it is in the loaded definition). Never guess a parameter
   that the schema does not list.

## 2. Plan payload → tool parameters
Match by meaning; names below are the usual ones. If the schema lists a different name for the same thing, use it.

| plan field | usual parameter(s) | notes |
|---|---|---|
| `teamId` | `teamId`, `team` | `team` may accept key or id; send the id |
| `title`, `description` | `title`, `description` | description is markdown; send it byte-for-byte |
| `priority` | `priority` | 0 none · 1 urgent · 2 high · 3 medium · 4 low |
| `stateId` | `stateId`, `state` | `state` may take a name: then send the state **name** from `hitl-index tickets status`/the init list |
| `labelIds` | `labelIds`, `labels` | usually **replaces** the set → always merge with remote labels on update |
| `projectId` | `projectId`, `project` | |
| `parentId` | `parentId`, `parent` | some servers want the uuid, not `ENG-7` |
| `blockedBy` (addRelations) | `blockedBy` (array of issue ids/identifiers) | append-only; MCP cannot remove relations |
| `projectId` from a pinned `linear.project` | `projectId`, `project` | attach only; never call save/update project for it |
| project `name`, `summary`, `content` | `name`, `summary`/`description`, `content`/`description` | if only `description` exists, send `content` there and drop `summary` (report `skippedFields: ["summary"]`) |
| comment `body` | `body` + `issueId` (create) / `id` (update) | no update tool → create a new comment, report `commentId` of the new one |

Results to extract (any field missing → omit it, the CLI has fallbacks):
- issue: `id` (uuid), `identifier` → result `issue`, `url`, `branchName`/`gitBranchName` → result `branch`,
  `description` (as stored), `projectId`/`parentId` when you substituted them;
- project: `id`, `url`; comment: `id` → `commentId`.

## 3. Errors
| error | treat as |
|---|---|
| tool missing / server not connected / 401 / 403 / "authentication" / "unauthorized" | unreachable → stop, queue the rest |
| network / timeout / 429 / "rate limit" | unreachable → stop, queue the rest |
| validation error on one op (bad id, missing field) | that op `ok:false` with the message; continue |
| state or label id not found | that op `ok:false`; suggest `/hitl:tickets init` once in the report |

Never retry in a loop. Never fall back to another API (GraphQL, curl): pushing without MCP is out of scope.

## 4. Remote snapshot (`pull`)
From the list issues tool (team filter, include archived/completed/canceled if a flag exists, `limit`/`first` ≤ 50,
`cursor`/`after` for the next page, max 5 pages): per issue keep `id, identifier, url, title, description, priority,
state {id, name, type}, labels [{id, name}], assignee (display name), cycle (name or number), branchName, updatedAt`.
`state.type` is Linear's workflow type: `triage | backlog | unstarted | started | completed | canceled`.
If the list tool omits `description` or `labels`, call get issue for the mapped issues only (≤ 50 calls), else leave
the field out (the CLI then skips that comparison).

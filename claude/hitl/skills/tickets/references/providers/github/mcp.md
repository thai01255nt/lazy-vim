# GitHub Issues — MCP / gh discovery and parameter mapping (for /hitl:tickets)

Server: GitHub's remote MCP server `https://api.githubcopilot.com/mcp/` (Streamable HTTP, OAuth or a PAT), or the local
`github-mcp-server`. Claude Code: `claude mcp add --transport http github https://api.githubcopilot.com/mcp/`, then `/mcp`.
One server per GitHub account; each repo pins it with `github.server`. **Tool names are published at runtime only** —
discover, never hardcode. Names seen (not authoritative; they changed over time): `issue_read`, `issue_write` (method
`create` | `update`), older `get_issue` / `create_issue` / `update_issue`, `list_issues`, `search_issues`,
`add_issue_comment`, `sub_issue_write` (older `add_sub_issue`), `list_issue_types`, `get_label` / `list_label`, `get_me`.
**`gh` fallback** (allowed: `Bash(gh *)`): capabilities the MCP lacks — milestones, issue dependencies, issue fields —
go through `gh api` against the same repo, only after `gh auth status` shows the same account/host as the MCP identity.

## 1. Discover
1. Tool names `mcp__<server>__…` where `<server>` contains `github` (case-insensitive); deferred → `ToolSearch`
   `+github issue`, `+github label`.
2. Server choice is the CLI's (`hitl-index tickets server <server>… [--init] --json`); the pinned `github.server` is the
   only prefix used. Verify the identity (`connect.md` §1b) before any write.
3. Read each tool's schema before its first call. Never guess a parameter the schema does not list.

## 2. Plan payload → parameters
| plan field | GitHub | notes |
|---|---|---|
| `teamId` | `owner` + `repo` | from `github.team` = `owner/repo` |
| `title`, `description` | `title`, `body` | body is GitHub markdown: send byte-for-byte |
| `stateId` | `state` + `state_reason` | `open` → state open · `closed:completed` → closed/completed · `closed:not_planned` → closed/not_planned |
| `labels` | `labels: [names]` | usually **replaces** the set on update → merge with remote |
| `priorityName` | issue field `github.priorityField` (Priority) | no tool for issue fields → `gh api` GraphQL when available, else `skippedFields:["priority"]`; `github.priorityLabels: true` → also add label `priority:<name>` |
| `projectId` | `milestone` (number) | the change's milestone, or a pinned one (`github.project`; never edit it) |
| `parentId` | sub-issue of the parent | after create: `sub_issue_write` (method add) on the parent with this issue's **id** (not number) |
| `issueType` | — | not sent (GitHub issue types are org-level; omit) |
| `blockedBy` | issue dependency "blocked by" | `gh api -X POST repos/<o>/<r>/issues/<n>/dependencies/blocked_by -F issue_id=<blocker id>`; not available → `skippedFields:["blockedBy"]` + `📌` manual note |
| comment `body` | `add_issue_comment` | no update tool → a new comment; report its id |

Results: `id` (node id or numeric id — keep what the tool returns, consistently), `issue` = `#<number>`, `url`
(`html_url`), `description` = body as stored. No branch name: omit `branch` (the CLI builds `<owner-repo>-<n>-<slug>`).

## 3. Errors
Missing tool / 401 / 403 / "Resource not accessible" → unreachable, stop and queue; network / 429 / secondary rate
limit → unreachable; a validation error on one op (422) → that op `ok:false`, continue. Never retry in a loop.

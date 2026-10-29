# GitHub Issues — plan payload → parameters (MCP + `gh api`)

Server: GitHub's remote MCP `https://api.githubcopilot.com/mcp/` (OAuth or a PAT) or the local `github-mcp-server`; one
server per account, pinned with `github.server`. Tool names change over time (`get_issue`/`create_issue` →
`issue_read`/`issue_write`): discover them (`connect.md`), never hardcode. Ids: REST numeric, as strings (`connect.md`).

Match by meaning; if the schema names the same thing differently, use its name. Ignore `labelIds` (same names as
`labels`), `priority` (hitl's number), `issueType` (GitHub issue types are org-level: not sent), `stateType`, `expect`
and `meta`. `<o>/<r>` = status `team`; an existing issue is addressed by its number (`issue` `#n` → `n`).

| plan field | GitHub | notes |
|---|---|---|
| `teamId` | `owner` + `repo` | from status `team` (`owner/repo`); `teamId` itself is the repo id (identity only) |
| `title`, `description` | `title`, `body` | GitHub markdown: send byte-for-byte |
| `stateId` | `state` + `state_reason` | `open` → open · `closed:completed` → closed / completed · `closed:not_planned` → closed / not_planned |
| `labels` | `labels: [names]` | **replaces** the set on update → merge with remote (`push-ops.md`) |
| `priorityName` | issue field `github.priorityField` (`Priority`) | no MCP tool → `gh api graphql` when available, else `skippedFields: ["priority"]`; `github.priorityLabels: true` → also the label `priority:<priorityName>`, every other `priority:*` label removed (`push-ops.md`) |
| `projectId` | `milestone` (number) | the change's milestone, or a pinned one (`github.project`; never edit it) |
| `parentId` | sub-issue of the parent | `sub_issue_write` (method `add`) on parent number with `sub_issue_id` = this issue's REST **id**; else `gh api -X POST repos/<o>/<r>/issues/<parent n>/sub_issues -F sub_issue_id=<id>` |
| `blockedBy` | issue dependency "blocked by" | `gh api -X POST repos/<o>/<r>/issues/<n>/dependencies/blocked_by -F issue_id=<blocker REST id>`; not available → `skippedFields: ["blockedBy"]` + `📌` note |
| comment `body` | `add_issue_comment` | no update tool → a new comment; report its id as `commentId` |

Results: `id` = the issue's REST `id` (string), `issue` = `#<number>`, `url` = `html_url`, `description` = body as
stored. No branch name: omit `branch` (the CLI builds `<owner-repo>-<n>-<slug>`).

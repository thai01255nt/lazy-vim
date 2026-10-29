# GitHub — tools and identity (with `references/common/connect.md`)

- Tool pattern: `mcp__<server>__…` where `<server>` contains `github` (case-insensitive). One server = one GitHub
  account. Deferred → `ToolSearch` `+github issue`, `+github label`.
- `legacy`: the candidate that can read the repository status `team` (`owner/repo`).
- **Ids** (one form everywhere, as strings): the REST numeric ids — repository `id` (init `team.id`, identity), issue
  `id` (results, relations, sub-issues; not the `#number`, not a node id `I_…`), milestone **number** (`projectId`).
  A tool that returns only a node id → read the REST id with `gh api repos/<o>/<r> --jq .id` /
  `gh api repos/<o>/<r>/issues/<n> --jq .id`.
- **`gh`** (allowed: `Bash(gh *)`) only for what the MCP lacks (milestones, dependencies, issue fields, REST ids) and
  only after `gh auth status` shows the same host and the same account as `get_me`; otherwise do not use `gh` (that
  field → `skippedFields`). A push without the MCP is not possible (`none` → fail-open).

| capability | candidates (first that exists) |
|---|---|
| who am I | `get_me` |
| create / update issue | `issue_write` (method `create` / `update`), else `create_issue` + `update_issue` |
| get / list issues | `issue_read` (method `get`), `get_issue` / `list_issues`, `search_issues` |
| labels | `list_label`, `get_label`; create: `label_write`, else `gh label create` |
| sub-issues | `sub_issue_write` (method `add`), `add_sub_issue` |
| comment | `add_issue_comment` |
| repository, milestones, dependencies, issue fields | `gh api` (see `mcp.md`) |

Identity (common §2 step 1): read the repository status `team` (`owner/repo`) — an MCP repository read / search tool,
else `gh api repos/<o>/<r>` — → `team: {"id":"<repo REST id>","key":"<full_name>"}`, `workspace: {"urlKey":"<owner
login>"}` (not found / no access → `team: null`). `project` (status `project.id` set: a pinned milestone) =
`gh api repos/<o>/<r>/milestones/<project.id>` → `{"id":"<number>"}`, not found → `null`.

# Linear — plan payload → tool parameters

Server: `https://mcp.linear.app/mcp` (one OAuth per workspace; a read-only key or `read` scope makes every write fail →
the ops are queued). Tool names change over time (`create_issue`/`update_issue` → `save_issue`): discover them
(`connect.md`), never hardcode.

Match by meaning; if the schema names the same thing differently, use its name. Ignore payload keys not listed here
(e.g. `stateType`, `expect`, `meta`).

| plan field | usual parameter(s) | notes |
|---|---|---|
| `teamId` | `teamId`, `team` | send the id (`team` may also accept the key) |
| `title`, `description` | `title`, `description` | markdown; send byte-for-byte |
| `priority` | `priority` | 0 none · 1 urgent · 2 high · 3 medium · 4 low |
| `stateId` | `stateId`, `state` | `state` takes a name → send the state **name** of that id (init's state list / the issue's states) |
| `labelIds` | `labelIds`, `labels` | usually **replaces** the set → on update always send the merged set (`push-ops.md`) |
| `projectId` | `projectId`, `project` | also a pinned `linear.project`: attach only, never save/update that project |
| `parentId` | `parentId`, `parent` | some servers want the uuid, not `ENG-7` |
| `blockedBy` (addRelations) | `blockedBy` (array of issue ids) | append-only; MCP cannot remove relations |
| project `name`, `summary`, `content` | `name`, `summary`/`description`, `content`/`description` | only `description` exists → send `content` there, `skippedFields: ["summary"]` |
| comment `body` | `body` + `issueId` (create) / `id` (update) | no update tool → create a new comment, report its `commentId` |

Results to extract (missing → omit; the CLI has fallbacks): issue `id` (uuid) → `id`, `identifier` → `issue`, `url`,
`branchName`/`gitBranchName` → `branch`, `description` as stored, `projectId`/`parentId` when you substituted them;
project `id`, `url`; comment `id` → `commentId`.

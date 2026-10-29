# Jira — push: executing the plan ops (`/hitl:tickets push`, SKILL.md §4 step 4)

Tools from `connect.md` §1 (one server only); parameters per `mcp.md` §2. Execute the chosen ops **in plan order**; one
result per executed op: `{"opId","ok":true,…}` or `{"opId","ok":false,"error":"<message>"}`. Ignore each op's `meta`.
- `ensureParent` (`payload.container` = `epic` or `parent-issue`) → create (no `id`) or edit (`id`) an issue in project
  `teamId` with `summary` = `title`, `description`, issue type `payload.issueType`; with `projectId` (pinned epic) also
  `parent`. Result: `id`, `issue` (key), `url`.
- `ensureProject` → does not occur for Jira (a pinned epic is never edited).
- `createIssue` → create with `summary`, `description`, issue type `payload.issueType`, `priority: {name: priorityName}`,
  `labels: payload.labels`, `parent` = `parentId` or else `projectId` (when null and the op has `change`, use the id
  returned by this run's `ensureParent` for that change; report it as `parentId`). Then, when `stateId` differs from
  the new issue's status, transition it (`getTransitions…` → target status id = `stateId`); not reachable →
  `skippedFields: ["stateId"]`. Result: `id`, `issue`, `url`, `description` (as returned).
- `updateIssue` → get the issue first, then (a) labels: current names **minus** `payload.labels.remove` **plus**
  `payload.labels.add` (never drop other labels); (b) `payload.fields.stateId` present and the remote status category
  ≠ `payload.expect.stateType` (`unstarted`→To Do, `started`/`review`→In Progress, `completed`→Done, `canceled`→Done)
  → no transition, `skippedFields: ["stateId"]`, report `⚠️ <issue> status changed in Jira (<status>) — kept`; else
  transition; (c) edit the other fields (`title`→summary, `description`, `priorityName`→priority, `parentId`/`projectId`
  →parent). Result: `ok`, optional `description`, `skippedFields`.
- `addRelations` → for each `payload.blockedBy[]`: link type **Blocks**, outward = the blocker, inward = this issue.
  No link tool → `ok:true` with `skippedFields:["blockedBy"]` and print `📌 link <issue> is blocked by <keys> by hand`.
- `manualNote` → print `📌 <payload.message>`; `ok: true` without calling Jira.
- `upsertComment` → add a comment with `body` (Jira MCP has no comment update: always a new one). Result: `commentId`.
- `cancelIssue` → transition to the status `payload.stateId`.
Stop at the first auth / network / rate-limit error; every remaining chosen op gets `{"ok":false,"error":"unreachable: <msg>"}`.
Any other error → that op `ok:false`, continue.

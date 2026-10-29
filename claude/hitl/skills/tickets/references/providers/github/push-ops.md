# GitHub — push: executing the plan ops (SKILL.md §4 step 4)

Tools from `connect.md` (the chosen server only) plus `gh api` where `mcp.md` says so; errors per
`references/common/connect.md` §3 (stop at the first auth / network / rate-limit error). Execute the chosen ops **in
plan order**; one result per executed op: `{"opId","ok":true,…}` or `{"opId","ok":false,"error":"<message>"}`. Ignore
each op's `meta`. Ids per `connect.md` (REST numeric, strings; `#n` addresses an existing issue).
- `ensureProject` (`payload.container: "milestone"`) → `payload.id` null: `gh api -X POST repos/<o>/<r>/milestones
  -f title=<name> -f description=<content>`; else `gh api -X PATCH repos/<o>/<r>/milestones/<id>` with the same
  fields. Result: `id` = the milestone **number**, `url` (`html_url`), `skippedFields: ["summary"]` (not a milestone field).
- `ensureParent` → create (`payload.id` null) or update an issue with `title`, `body` = `description`, plus
  `milestone` = `projectId` when present (pinned milestone). Result: `id`, `issue` (`#n`), `url`.
- `createIssue` → create with `title`, `body`, `labels: payload.labels` (+ `priority:<priorityName>` when
  `github.priorityLabels` is on), `milestone: projectId` (null and the op has `change` → the milestone number returned
  by this run's `ensureProject`; report it as `projectId`). Then: `parentId` (or this run's `ensureParent` id) → add as
  sub-issue of that parent (report it as `parentId`); `stateId` ≠ `open` → update the state; `priorityName` → the issue
  field per `mcp.md`. Result: `id`, `issue`, `url`, `description`.
- `updateIssue` → read the issue (`#n`) first, then **one** update carrying:
  (a) labels = current names **minus** `payload.labels.remove` **plus** `payload.labels.add` (never drop other
  labels), and when `fields.priorityName` is present and `github.priorityLabels` is on: minus every other `priority:*`
  label, plus `priority:<priorityName>`; send labels only when something changed;
  (b) state guard, only when `fields.stateId` is present: `payload.expect.stateType` is `null` → no guard, send the
  state (remote already closed → still send, and print `⚠️ <issue> was closed in GitHub; hitl reopened it`); else the remote state ≠ the expected one (`completed` ↔ closed/completed, `canceled` ↔ closed/not_planned,
  any other type ↔ open) → keep it, `skippedFields: ["stateId"]`, print `⚠️ <issue> state changed in GitHub
  (<state>) — kept`;
  (c) `title`, `body`, `milestone` (`projectId`). Then `priorityName` → the issue field per `mcp.md`; `parentId` →
  sub-issue add. Result: `ok`, `description`, `skippedFields`.
- `addRelations` → per `payload.blockedBy[]`: `gh api -X POST repos/<o>/<r>/issues/<n>/dependencies/blocked_by
  -F issue_id=<blocker id>`. Not available → `ok:true`, `skippedFields: ["blockedBy"]`, print `📌 mark <issue> blocked
  by <issues> by hand`.
- `manualNote` → print `📌 <payload.message>`; `ok: true`.
- `upsertComment` → `add_issue_comment` on `#n` (no update tool → a new comment). Result: `commentId`.
- `cancelIssue` → close with `state_reason: not_planned`.

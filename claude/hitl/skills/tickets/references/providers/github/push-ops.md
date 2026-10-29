# GitHub — push: executing the plan ops (`/hitl:tickets push`, SKILL.md §4 step 4)

Tools from `connect.md` §1 (one server) plus `gh api` where `mcp.md` §2 says so. Execute the chosen ops **in plan
order**; one result per executed op: `{"opId","ok":true,…}` or `{"opId","ok":false,"error":"<message>"}`. Ignore `meta`.
- `ensureProject` (`payload.container: "milestone"`) → `payload.id` null: `gh api -X POST repos/<o>/<r>/milestones
  -f title=<name> -f description=<content>`; else PATCH `…/milestones/<id>` with the same fields. Result: `id` (the
  milestone **number**), `url` (`html_url`). (`summary` is not a milestone field: report `skippedFields:["summary"]`.)
- `ensureParent` → create / update an issue with `title`, `body` = `description` (+ `milestone` = `projectId` when a
  milestone is pinned). Result: `id`, `issue` (`#n`), `url`.
- `createIssue` → create with `title`, `body`, `labels: payload.labels`, `milestone: projectId` (null and the op has
  `change` → the milestone number returned by this run's `ensureProject`; report it as `projectId`). Then: `parentId`
  (or this run's `ensureParent` id) → add as sub-issue of that parent; `stateId` ≠ `open` → update state;
  `priorityName` → issue field or `priority:<name>` label per `mcp.md`. Result: `id`, `issue`, `url`, `description`.
- `updateIssue` → read the issue first, then (a) labels: current names − `labels.remove` + `labels.add` (never drop
  other labels); (b) `fields.stateId` present and the remote state ≠ the expected one (`payload.expect.stateType`:
  `completed` ↔ closed/completed, `canceled` ↔ closed/not_planned, anything else ↔ open) → keep it,
  `skippedFields:["stateId"]`, `⚠️ <issue> state changed in GitHub (<state>) — kept`; (c) send `title`, `body`,
  `milestone` (`projectId`), state, priority; `parentId` → sub-issue add. Result: `ok`, `description`, `skippedFields`.
- `addRelations` → per blocker: `gh api -X POST repos/<o>/<r>/issues/<n>/dependencies/blocked_by -F issue_id=<blocker
  numeric id>` (the blocker's REST `id`, read it with `gh api repos/<o>/<r>/issues/<m> --jq .id` when the map holds a
  node id). Not available → `ok:true`, `skippedFields:["blockedBy"]`, `📌 mark <issue> blocked by <issues> by hand`.
- `manualNote` → print `📌 <payload.message>`; `ok: true`.
- `upsertComment` → `add_issue_comment` (no update tool → a new comment). Result: `commentId`.
- `cancelIssue` → close with `state_reason: not_planned`.
Stop at the first auth / network / rate-limit error (remaining ops → `unreachable: <msg>`); other errors → that op
`ok:false`, continue.

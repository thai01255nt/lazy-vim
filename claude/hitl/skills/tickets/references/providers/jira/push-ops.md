# Jira — push: executing the plan ops (SKILL.md §4 step 4)

Tools from `connect.md` (the chosen server only); parameters per `mcp.md`; errors per `references/common/connect.md` §3
(stop at the first auth / network / rate-limit error). Execute the chosen ops **in plan order**; one result per executed
op: `{"opId","ok":true,…}` or `{"opId","ok":false,"error":"<message>"}`. Ignore each op's `meta`.
- `ensureParent` (`payload.container` = `epic` or `parent-issue`) → create (`payload.id` null) or edit (`id`) an issue
  in project `teamId` with `summary` = `title`, `description`, issue type `payload.issueType`; with `projectId` (pinned
  epic) also `parent`. Result: `id`, `issue` (key), `url`.
- `ensureProject` → does not occur for Jira (a pinned epic is never edited).
- `createIssue` → create in project `teamId` with `summary`, `description`, issue type `payload.issueType`,
  `priority: {name: priorityName}`, `labels: payload.labels`, `parent` = `parentId`, else `projectId`; both null and
  the op has `change` → the id returned by this run's `ensureParent` for that change (report it as `parentId`). Then,
  when the new issue's status id ≠ `stateId`, transition it; no transition reaches it → `skippedFields: ["stateId"]`.
  Result: `id`, `issue`, `url`, `description` (as returned).
- `updateIssue` → get the issue (`id`) first, then:
  (a) one edit with `labels` = current names **minus** `payload.labels.remove` **plus** `payload.labels.add` (only
  when add or remove is non-empty; never drop other labels) together with the other `payload.fields` (`title` →
  summary, `description`, `priorityName` → priority, `parentId` / `projectId` → parent); skip the edit when there is
  nothing to send;
  (b) `payload.fields.stateId` present: `payload.expect.stateType` is `null` → no guard, transition; else the remote
  status category ≠ the expected one (`unstarted` → To Do, `started` / `review` → In Progress, `completed` /
  `canceled` → Done) → no transition, `skippedFields: ["stateId"]`, print `⚠️ <issue> status changed in Jira
  (<status>) — kept`; else transition.
  Result: `ok`, `description` (as returned, when returned), `skippedFields`.
- `addRelations` → per `payload.blockedBy[]`: link type **Blocks**, outward = the blocker, inward = this issue. No link
  tool → `ok:true`, `skippedFields: ["blockedBy"]`, print `📌 link <issue> is blocked by <keys> by hand`.
- `manualNote` → print `📌 <payload.message>`; `ok: true` without calling Jira.
- `upsertComment` → add a comment with `body` (no comment update: always a new one). Result: `commentId`.
- `cancelIssue` → transition to the status `payload.stateId`.

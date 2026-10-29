# Linear — push: executing the plan ops (SKILL.md §4 step 4)

Tools from `connect.md` (the chosen server only); parameters per `mcp.md`; errors per `references/common/connect.md` §3
(stop at the first auth / network / rate-limit error). Execute the chosen ops **in plan order**; one result per executed
op: `{"opId","ok":true,…}` or `{"opId","ok":false,"error":"<message>"}`. Ignore each op's `meta` (CLI-internal). Ops
carry `change` (the change id; legacy queue items may say `planning`, same meaning).
- `ensureProject` → upsert project: `payload.id` null → create with `name`, `summary`, `content`, team `teamId`; else
  update that id. Result: `id`, `url`.
- `ensureParent` → upsert issue with `title`, `description`, `teamId`, plus `projectId` when present (a pinned
  `linear.project`) (+ `id` to update). Result: `id`, `issue` (identifier), `url`.
- `createIssue` → upsert issue without `id`: `title`, `description`, `teamId`, `priority`, `stateId`, `labelIds`,
  `projectId` / `parentId` (a pinned `linear.project` arrives as `projectId`: attach only). Null and the op has
  `change` → use the id returned by this run's `ensureProject` / `ensureParent` for that change and report it as
  `projectId` / `parentId`. Result: `id`, `issue` (e.g. `ENG-12`), `url`, `branch` (`branchName`/`gitBranchName`
  when returned), `description` (as returned).
- `updateIssue` → get the issue (`id`) first, then **one** upsert with `id` carrying:
  (a) labels: the remote label ids **minus** `payload.labels.remove` **plus** `payload.labels.add` (never drop
  non-hitl labels); send them only when add or remove is non-empty;
  (b) state guard, only when `payload.fields.stateId` is present: `payload.expect.stateType` is `null` → no guard, send
  `stateId` (remote type already completed/canceled → still send, and print `⚠️ <issue> was <state> in Linear; hitl moved it to <new state>`); else the remote state's type ≠ `expect.stateType` (`review` means a `started`-type state) → do not send
  `stateId`, add `"stateId"` to `skippedFields`, print `⚠️ <issue> state changed in Linear (<remote state>) — kept`;
  (c) the other `payload.fields` (`title`, `description`, `priority`, `projectId`, `parentId`).
  Result: `ok`, `description` (as returned, when returned), `skippedFields`.
- `addRelations` → upsert issue `id` with `blockedBy: [payload.blockedBy[].id]` (append-only; never try to remove).
- `manualNote` → print `📌 <payload.message>`; `ok: true` without calling Linear.
- `upsertComment` → `payload.commentId` set and an update tool exists → update that comment's `body`; else create a
  comment on issue `id` with `body`. Result: `commentId`.
- `cancelIssue` → upsert issue `id` with `stateId = payload.stateId`.

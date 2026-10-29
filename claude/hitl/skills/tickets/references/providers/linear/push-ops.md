# Linear — push: executing the plan ops (`/hitl:tickets push`, SKILL.md §4 step 4)

The tools are the ones chosen in `connect.md` §1 (one server only); parameter names per `mcp.md` §2.

Execute the chosen ops **in plan order**; one result per executed op: `{"opId","ok":true,…}` or
   `{"opId","ok":false,"error":"<message>"}`. Ignore each op's `meta` (CLI-internal). Per op:
   - Ops carry `change` (the change id; legacy queue items may still say `planning`, same meaning).
   - `ensureProject` → upsert project (`payload.id` null → create with `name`, `summary`, `content`, team `teamId`;
     else update). Result: `id`, `url`. `ensureParent` → upsert issue with `title`, `description`, `teamId`
     (+ `id` to update). Result: `id`, `issue` (identifier), `url`.
   - `createIssue` → upsert issue without `id`: `title`, `description`, `teamId`, `priority`, `stateId`, `labelIds`,
     `projectId`/`parentId` (a pinned `linear.project` arrives as `projectId`; never create or update that project). When `projectId`/`parentId` is null and the op has `change`, use the id returned by
     this run's `ensureProject`/`ensureParent` for that change (report it as `projectId`/`parentId`). Result: `id`,
     `issue` (identifier, e.g. `ENG-12`), `url`, `branch` (the issue's `branchName`/`gitBranchName` when returned),
     `description` (as returned, when returned).
   - `updateIssue` → first get the issue (`id`), then:
     (a) labels: send current remote label ids **minus** `payload.labels.remove` **plus** `payload.labels.add` (never
     drop non-hitl labels; the label parameter usually replaces the whole set);
     (b) if `payload.fields.stateId` is present and the remote state type ≠ `payload.expect.stateType` (`review` means a
     started-type state) → do not send `stateId`, add `"stateId"` to `skippedFields`, report
     `⚠️ <issue> state changed in Linear (<remote state>) — kept`;
     (c) send the other `payload.fields` (`title`, `description`, `priority`, `stateId`, `projectId`, `parentId`).
     Result: `ok`, optional `description` (as returned), `skippedFields`.
   - `addRelations` → upsert issue `id` with `blockedBy: [payload.blockedBy[].id]` (append-only; never try to remove).
   - `manualNote` → print `📌 <payload.message>`; result `ok: true` without calling Linear.
   - `upsertComment` → `payload.commentId` set and an update tool exists → update that comment's `body`; else create a
     comment on issue `id` with `body`. Result: `commentId`.
   - `cancelIssue` → upsert issue `id` with `stateId = payload.stateId`.
   Stop executing at the first auth / network / rate-limit error; every remaining chosen op gets
   `{"ok":false,"error":"unreachable: <msg>"}`. Any other error → that op `ok:false`, continue.

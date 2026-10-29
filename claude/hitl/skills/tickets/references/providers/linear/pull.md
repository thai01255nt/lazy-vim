# Linear — `pull [--relink]` (read-only)

1. Server pick and identity check (`references/common/connect.md` §1–§2); stop on none / missing / mismatch / unreachable.
2. List issues of the team status `teamId` (page size `limit`/`first` ≤ 50, include archived / completed / canceled when
   the tool has such a flag, follow `cursor`/`after`, max 5 pages). `"complete": true` only when every page was read.
   The list omits `description` or `labels` → get issue for the mapped issues only (≤ 50 calls), else leave the field
   out (the CLI then skips that comparison).
3. Normalize to `{"schema":"hitl.tickets-remote/1","complete":bool,"issues":[{"id","identifier","url","title",
   "description","priority","state":{"id","name","type"},"labels":[{"id","name"}],"assignee":"<display name>"|null,
   "cycle":"<name or number>"|null,"branchName"|null,"updatedAt"}],"identity":<the common §2 object>}` (`state.type`
   is Linear's: `triage | backlog | unstarted | started | completed | canceled`); Write `.hitl/.inbox/tickets-remote.json`.
4. `hitl-index tickets diff --in .hitl/.inbox/tickets-remote.json [--relink] --json`. Print the items table
   `level | code | task | issue | field | local → remote` with the suggestion per code (SKILL.md §5), then
   `T-1: <state> · assignee <a> · cycle <c>` per task.

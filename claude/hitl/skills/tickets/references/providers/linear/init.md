# Linear — `init [--relink]` (`/hitl:tickets init`, only when the user typed it)

1. Discover tools (`connect.md` §1) and run `hitl-index tickets server <server>… --init --json`.
   - `none` → print `❌ Linear MCP not found. Install it: claude mcp add --transport http linear-server
     https://mcp.linear.app/mcp (or the "linear" plugin), run /mcp to authenticate, then /hitl:tickets init`. Stop.
   - `use` → keep the pinned server (to switch: the user names another one; then save it as below).
   - `save` → exactly one Linear server: `hitl-index init --set linear.server=<server>` and say so in one line.
   - `pick` → ⛔ GATE: table `# | server | workspace | teams` (call list teams on each candidate if cheap; workspace
     urlKey from a returned URL, `?` when unknown; a server that fails auth → `not authenticated (/mcp)`), 💡 none
     preselected unless only one is authenticated. END TURN. On reply: `hitl-index init --set linear.server=<server>`.
     A missing workspace: `claude mcp add --transport http linear-<name> https://mcp.linear.app/mcp`, `/mcp`, init again.
   From here on call only that server's tools.
2. Call list teams and list projects (of the team, when the tool filters by team). ⛔ GATE: table of teams (key, name)
   and the choices with defaults: team (💡 the only/first one) · issues go to: `one project per change` 💡 /
   `existing project <pick: table of list_projects name + url>` / `parent-issue per change` / `none` · label
   groups risk + impl 💡 (phase labels `hitl:<status>` off 💡). With an existing project, `parent-issue` can be combined
   (parent issues inside that project). Also list the labels that will be created if missing:
   `risk:high`, `impl:agent`, `impl:manual`, `impl:mixed` (+ `hitl:skeleton|approved|red|wip|green|review|verified`
   when phase is on). END TURN. A project given as a name or URL → resolve it with list/get projects to its id.
3. On reply: `hitl-index init --set linear.enabled=true --set linear.team=<KEY> --set linear.changeAs=<x>`
   (`project` for "one project per change" and also for "existing project" alone; `parent-issue`; `none`)
   + `--set 'linear.project={"id":"<uuid>","name":"<name>"}'` for an existing project, else `--set linear.project=null`
   (+ `--set linear.labels.phase=true` / `--set linear.labels.risk=false` / `--set linear.labels.impl=false` when chosen).
   hitl never renames or edits an existing project; it only attaches issues to it.
4. List the team's states. Pick one per type: `backlog`, `unstarted`, `started`, `completed`, `canceled` (the first
   state of each type by position); `review` = a `started`-type state whose name matches `/review/i`, or the state named
   in config `linear.stateNames.review`; none → `null` (hitl then uses `started` for green/review/verified).
5. List the team's labels; create the missing enabled hitl labels (names exactly as above). Collect `{name: id}`.
   Creating a label is denied (403 "not allowed to create labels", common on the free plan or for non-admins) → stop
   creating, print the missing labels as a table `name | color | description` (`${CLAUDE_SKILL_DIR}/references/labels.md`) for the user
   to create in Linear (Settings → Labels, workspace or team level both work), and offer `labels off`
   (`--set linear.labels.risk=false --set linear.labels.impl=false`). END TURN; on "created" list the labels again.
6. Write `.hitl/.inbox/tickets-init.json`:
   `{"schema":"hitl.tickets-results/1","kind":"init","relink":<true only with --relink>,"init":{"workspace":{"urlKey":"<from
   a team/issue/project URL>"}|null,"team":{"key","id","name"},"project":{"id","name","url"}|null,
   "states":{"backlog":{"id","name"}|null,…},"labels":{"risk:high":"<id>",…}}}`
   then `hitl-index tickets record --in .hitl/.inbox/tickets-init.json --json`.
   Exit 4 (the map is linked to another workspace/team) → print the message: either the wrong server was picked
   (fix `linear.server`) or the repo really moves → the user runs `/hitl:tickets init --relink` (clears the old task
   mappings; the next push creates new issues). Never add `relink` without the flag.
7. Print `✅ Linear linked: <workspace>/<KEY> via <server> · project <name|per change> · states … · labels …`,
   `ℹ️ linear.map.json + hitl.config.json are per repo: commit them; every repo runs /hitl:tickets init once (repos may
   share a team/project)`, and the recommended team setting:
   `💡 Linear → Team → Workflow → GitHub: keep "On PR merge → Done" off, or accept that a merge after /hitl:approve done marks Done.`
   🎯 next: `/hitl:tickets push`.

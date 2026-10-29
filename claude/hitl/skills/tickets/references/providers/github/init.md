# GitHub — `init [--relink]` (`/hitl:tickets init`, only when the user typed it)

1. Server (`references/common/connect.md` §1, with `--init`):
   - `none` → `❌ GitHub MCP not found. Install it: claude mcp add --transport http github https://api.githubcopilot.com/mcp/,
     run /mcp to authenticate, then /hitl:tickets init`. Stop.
   - `pick` → ⛔ GATE `# | server | account` (account from `get_me`), END TURN; on reply save it.
2. Repository: 💡 this repo's `origin` (`git remote get-url origin` → `owner/repo`); read it (`connect.md`: REST `id`,
   `full_name`, issues enabled?). Issues disabled → `❌ issues are disabled on <owner/repo>`; stop. ⛔ GATE: repo
   (💡 origin) · a change becomes: `one milestone per change` 💡 / `existing milestone <pick: open milestones>` /
   `parent-issue per change` (sub-issues) / `none` · label groups risk + impl 💡 (phase off 💡) · priority: issue field
   `Priority` 💡 when the org defines it, else `priority labels` / `none`. END TURN.
3. On reply: `hitl-index init --set github.enabled=true --set github.team=<owner/repo> --set github.changeAs=<milestone|parent-issue|none>`
   + `--set 'github.project={"id":"<milestone number>","name":"<title>"}'` for an existing milestone, else
   `--set github.project=null` (+ `--set github.priorityLabels=true` / label switches as chosen).
4. States (fixed, no listing): `{"backlog":null,"unstarted":{"id":"open","name":"Open"},"started":{"id":"open","name":"Open"},
   "review":null,"completed":{"id":"closed:completed","name":"Closed"},"canceled":{"id":"closed:not_planned","name":"Closed as not planned"}}`.
   The hitl phase is visible through the `hitl:*` labels (turn phase labels on for a useful board).
5. Labels: list the repo's labels; create the missing enabled hitl labels with the colors and descriptions of
   `${CLAUDE_SKILL_DIR}/references/labels.md` (`label_write`, else `gh label create <name> --color <hex without #>
   --description …`), plus `priority:urgent|high|medium|low` when priority labels are on. Denied → print the table
   `name | color | description` for the user to create (repo → Issues → Labels), END TURN; on "created" list again.
   Map `{name: name}`.
6. Write `.hitl/.inbox/tickets-init.json`
   `{"schema":"hitl.tickets-results/1","kind":"init","relink":<true only with --relink>,"init":{"workspace":{"urlKey":"<owner>"},
   "team":{"key":"<owner/repo>","id":"<repo REST id>","name":"<owner/repo>"},"project":{"id":"<milestone number>","name","url"}|null,
   "states":{…step 4…},"labels":{…}}}` → `hitl-index tickets record --in .hitl/.inbox/tickets-init.json --json`.
   Exit 4 (the map is linked to another owner/repository) → print the message: the wrong server was picked (fix
   `github.server`) or the repo really moved → the user runs `/hitl:tickets init --relink` (clears the old task
   mappings; the next push creates new issues). Never add `relink` without the flag.
7. Print `✅ GitHub linked: <owner/repo> via <server> · milestone <per change|title> · labels …`, the commit hint
   (`github.map.json` + `hitl.config.json` per repo; every repo runs `/hitl:tickets init` once), and 💡 `Fixes #n` in a
   PR closes the issue on merge — hitl uses `Part of #n` until the task is verified. 🎯 next: `/hitl:tickets push`.

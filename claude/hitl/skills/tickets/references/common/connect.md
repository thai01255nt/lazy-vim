# Connect — server pick, identity check, errors (every provider; `init`, `push`, `pull`)

Read before the first tracker call of `init`, `push` and `pull` (`status` never needs it), together with
`<PD>/connect.md` (provider specifics: tool name pattern, capability table, how to observe workspace / team / project).

## 1. Pick the server and the tools
1. Collect the tool names you can call that match the provider's pattern. Deferred (only names visible) → `ToolSearch`
   with the queries in `<PD>/connect.md`, then `select:<full name>,…` for the ones you need.
2. `hitl-index tickets server <server>… --json` (one argument per distinct server prefix seen, i.e. the `<server>` in
   `mcp__<server>__<tool>`; none seen → no argument; add `--init` during init). Act on `action`:

   | action | init | push | pull |
   |---|---|---|---|
   | `use` | keep it (the user names another one → save that one as below) | use **only** `server` for the whole run | same as push |
   | `save` | `hitl-index init --set <provider>.server=<server>`; say so in one line | — | — |
   | `pick` | ⛔ GATE per `<PD>/init.md` step 1; END TURN; on reply save the chosen one | — | — |
   | `missing` | print `❌ <message>`; stop | print `❌ <message>`; fail-open (SKILL.md §4 step 5), reason `pinned <Tracker> server <name> not available` | print `❌ <message>`; stop |
   | `none` | print the `<PD>/init.md` step 1 message; stop | fail-open, reason `<Tracker> MCP not connected` | print `⚠️ <Tracker> MCP not connected`; stop |
   | `legacy` | — | use the candidate that sees the mapped team (status `teamId`; how: `<PD>/connect.md`); none does → identity mismatch (§2 step 3, with `team.id` observed `null`); print the CLI's `💡` pin hint once (not with `--auto`) | same as push |

   `<message>` is the CLI's (it contains the `claude mcp add …` line and `/mcp`). Never call another server's tools,
   never fall back to another server or API (GraphQL, curl, `gh` where `<PD>` does not allow it).
3. Map each capability to the **first existing** tool of the `<PD>/connect.md` table. Before the first call of a tool,
   read its input schema; never send a parameter it does not list. A plan field with no matching parameter → do not
   send it, add the plan field name to that op's `skippedFields`, mention it once in the report. Mention a tool choice
   in the report only when it was a fallback (e.g. `create_issue` instead of `save_issue`).

## 2. Identity check (before every push and pull, also with `--auto`)
1. With the chosen server, observe `workspace`, `team` and `project` as `<PD>/connect.md` says. Expected values come
   from `hitl-index tickets status --json` (`teamId`, `team`, `project.id`). Not found → `null`; `project` only when
   status `project.id` is set (else omit it). Ids are strings, in the same form init recorded.
2. Write `.hitl/.inbox/tickets-identity.json`
   `{"schema":"hitl.tickets-identity/1","server":"<server>","workspace":{"urlKey":"<k>"}|null,"team":{"id":"<id>","key":"<key>"}|null,"project":{"id":"<id>"}|null}`
   (no `"project"` key when no container is pinned) and run `hitl-index tickets verify --in .hitl/.inbox/tickets-identity.json --json`. `verify` deletes that file: keep
   the object yourself (exactly as written, `schema` included) — it goes into the push results / remote file as `"identity"` (the CLI checks it again; a later
   pass of the same run reuses it).
3. Exit 4 / `ok: false` → **refuse the whole run**: execute nothing, record nothing (no results file, no queue entry).
   Print `❌ <Tracker> identity mismatch`, one line per `mismatches[]` (`<field>: expected <e> · observed <o>`), then
   the `fix` lines. With `--auto`: only `⚠️ <Tracker>: identity mismatch — /hitl:tickets push to see why`. Never fail
   the caller.
4. `status: learned` → `💡 recorded <learned> in <provider>.map.json`; each `warnings[]` → a `⚠️` line.
5. An auth / network error during this step is **unreachable**, not a mismatch: push → fail-open (SKILL.md §4 step 5,
   no `identity`); pull → `⚠️ <Tracker> unreachable (<msg>)`; stop.

## 3. Errors while executing ops (push)
| error | treat as |
|---|---|
| tool missing, server not connected, 401, 403, "authentication", "unauthorized", "Resource not accessible", network, timeout, 429, rate limit | unreachable: stop at once; this op and every remaining chosen op → `{"opId","ok":false,"error":"unreachable: <msg>"}` |
| validation error on one op (bad id or field, 422, transition not allowed) | that op `{"opId","ok":false,"error":"<message>"}`; continue |
| state or label id not found | that op `ok:false`; suggest `/hitl:tickets init` once in the report |

Never retry in a loop.

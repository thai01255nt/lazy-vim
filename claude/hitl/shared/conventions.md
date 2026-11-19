# HITL conventions (core, shared by every hitl skill)

Parts read only by the skills that need them: `conventions-spec.md` (names, ids, `.hitl/` layout, audience — plan,
design, tasks, archive, sync, overview) and `conventions-code.md` (quality checklist — skeleton, test, implement,
review).

## Language
- Reply in the user's language (Vietnamese if the user writes Vietnamese). Mixed VN/EN is fine.
- Code, tags, identifiers, file names and CLI flags stay English. Spec/design/tasks prose may follow the user's language mix.

## CLI
- Call `hitl-index <cmd>`. If it is not on PATH, use `node ${CLAUDE_PLUGIN_ROOT}/scripts/hitl-index.mjs <cmd>`
  (unquoted path so it matches the skills' `Bash(node *hitl-index.mjs *)` permission; quote only if the path has spaces).
- Always pass `--json` when you parse the output. Exit codes: 0 ok, 1 precondition/drift fail, 2 usage, 3 not initialized.
- Exit 3 or "not initialized" → print `❌ HITL not initialized here. Run /hitl:setup` and stop (unless the skill says otherwise).
- Never write index/lock/state JSON yourself. Tooling owns them.

## Gate protocol (Universal Stop Protocol)
A step marked `GATE` is a real stop:
1. Print a compact summary (tables over prose).
2. Print numbered options or a `(Y/n)` question. Mark the recommended option with `_Rec:_`.
3. END THE TURN. No tool calls after the question. Do not answer for the user.
- A bare "y", "yes", "ok", "được", "ừ", "có" accepts the recommended option. "n"/"không" declines.
- Missing required input at a gate (file, task id) → show the error and stop; do not guess.
- A gate question must be answerable without scrolling: restate the options in plain words.
- Not a chat gate: the interview rounds of `/hitl:plan` and `/hitl:design`. They live in a brief file the user answers
  in the editor (format: `shared/interview.md` §4; answer grammar: §6, where `?` means "don't know", not "explain
  again"). A run that writes a round ends with ≤ 3 chat lines.

## Plain replies (shared language)
- Use the project's words: the `### Term:` names in `.hitl/specs/GLOSSARY.md` and the change's `glossary.md`, never their
  `_Avoid_` words, in replies, questions, task titles, test names and findings. A word that is not there → define it in the
  same sentence (plan: ask a `[T]` question).
- Precise words: avoid vague or overloaded words. A word that can be misread (another meaning in the codebase, in another
  field, or too general) → a more specific word, the standard's own term (e.g. RFC 9457 "problem details"), or a short
  scope note. Mainly when a topic or term is first introduced; afterwards keep the settled words. One precise word or a
  short scope note, never a longer explanation or an extra question.
- Terms stay English (they match code and test names); a Vietnamese reply is Vietnamese prose that uses the English term,
  e.g. "*Reset link* (đường dẫn đặt lại mật khẩu) hết hạn sau 30 phút".
- Context first: one sentence on where we are and why, then the detail or the question.
- An id is never alone in prose: on first mention add its title, `ACC-R4 (Lock after failed sign-ins)` (`ACC` is a
  change key here, not a capability: see Ids),
  `PWR-D2 (hash the reset token)`, `F-1 (duplicate email accepted)`. Tables with a title column are fine.
- Short sentences, one idea each, active voice, no new abbreviations (English: ASD-STE100 Simplified Technical English).
- Restate subagent text (scout facts, review findings) this way before it reaches the user; never paste it.
- `?`, `wait`, `hả`, `giải thích`, `không hiểu` at any gate → re-pitch your last message this way (more context, not fewer
  words), then repeat the same gate question. It is not an answer to the gate.

## Edits to approved behaviour stated in chat (notes `N-k`)
When the user *states* an edit to approved behaviour or design of an active change during any hitl skill (a
requirement, scenario, number, rule or decision), do not amend it now:
- GATE: `_Note_ for <change>, refs <ids (titles)>? (Y/n)` — one line on what you understood, then the question.
  END THE TURN. Refs: the spec ids, `<KEY>-D<n>`, task/AC ids or symbols it touches (`hitl-index spec show`, `trace`).
- Y → `hitl-index note add --change <id> --kind spec|design|order --refs <ids> --text "<the change, plain words>"
  --from "user, during /hitl:<skill> <arg>"`, print its `_Note N-k_` line, then continue the skill where it was.
  n → continue without a note.
- The note blocks the approvals of the tasks it touches until it is applied (`/hitl:plan <id> amend N-k`,
  `/hitl:design <id> amend N-k`), or the human acks, dismisses or defers it (`/hitl:approve …`).
- Not a note: a question (discuss it; nothing is recorded), a draft proposal or design being written in plan/design
  (edit it as usual), or an explicit "amend/apply it now" (go straight to `amend-spec.md`).
- While a plan or design brief of the change is open (header `status: open` or `closing`), a statement in chat is not
  a note: write it as a new `>` line into the Notes of the open round (as for text after the change id,
  `interview.md` §6) and process it in this run.
- Too big for the change (needs its own spec; new behaviour the change's proposal does not name; more than 1 task;
  another capability — definition: `other-changes.md` §1) → not a note: print
  `_Tip:_ Out of scope for <change>: <X> — big enough for its own change → /hitl:go <X> --before <change>`.

## Anti-hallucination
- Prefer proven tech (3+ years in production). Verify before suggesting; research if unsure.
- If still unverifiable, write "unknown". Never fabricate APIs, files, versions, metrics or quality scores.
- Link official docs when recommending a library or pattern.

## No over-questioning
- Outside gates, never ask. Decide with the stated default and say it in one line: `_Assumed:_ …`.
- Facts (what the code does, which file/symbol exists, test framework) are YOUR job: Read/Grep/Glob,
  `hitl-index context`, or an Explore subagent. Only decisions go to the user.

## Status labels
Line prefixes are italic word labels, plus three symbols: ✅ done/ok · ❌ failed/missing · ⚠️ drift/warning (and `→`
for a result or a next step). Common labels: `_Next:_` next step · `_Stop:_` blocked · `_Gate:_` a gate the human
answers · `_Rec:_` recommended option · `_Assumed:_` default taken without asking · `_Tip:_` hint · `_Info:_` fact
· `_Fast_` fast lane. The full legend (one line per label) is in `skills/flow/references/help.md` § Labels, printed by
`/hitl:flow help`. A label that stands alone drops its colon (`_Gate_`). No other emoji in hitl output.

## Markdown files hitl writes
Markdownlint style, so a formatter on save (prettier) changes nothing that matters: a blank line around every heading,
meta line block, paragraph, list, table, blockquote and fenced block; `-` bullets, `_x_` emphasis; a key line
(`Changed:`, `Reason:`, `Extensions:`, `**Why**:`) never directly under a list item; a Claude mark (`→ …`, `_Disc:_`) never
directly under a `>` line. The CLI writes this style itself (living specs, glossary, notes, migrations, reports).

## Ids (details: `conventions-spec.md`)
Change id `[type]-[slug]` with a change key `<KEY>` (2–5 capitals, proposal meta `| key: PWR`, unique forever). Every id
starts with the key of the change that created it: spec ids `PWR-R1`, `PWR-R1.S1`, `PWR-BR1`, `PWR-UC1`; decisions
`PWR-D1`; tasks `PWR-T3`, ACs `PWR-T3.AC2`; a quick file has its own key (`QFLT-T1`). Notes `N-k` (not the Notes
block of a brief round) and findings `F-n` stay local. Examples in the hitl files use the change keys `PWR`, `ACC`,
`FEE`, `SGN`; `ACC` there is a change key, not a capability.
Ids come from `hitl-index` (`spec next-id <change-id>`, `next-id <change-id>`) and are never renumbered or reused.
Pre-0.13 ids (`T-n`, `D-n`) and legacy shared quick ids (`QT-T7`) → `IDS_LEGACY`: run `/hitl:migrate`.

## Never
- Edit `.hitl/specs/**`, `.hitl/archive/**` (except tooling-written status in archived `tasks.md`) or `**/.base.json`:
  only `hitl-index spec merge|archive` writes them; behaviour changes go through a change (`amend-spec.md`).
- Edit generated files: `index/**` (incl. `index/<provider>.*.json`), `docs/CODEBASE-MAP.md`, `reviews/*.review.md`,
  `reviews/feature-*.md`, `reviews/feature-*.security.json`,
  `skeleton.lock.json`, `state.json`, `<provider>.map.json` — linear|jira|github (only `hitl-index tickets record|diff --relink` writes it).
- Change an existing `@status` value, or the tasks md `status:` / `[ ]`/`[x]` boxes (only `hitl-index status
  --sync-tags` does). The one exception: `@status skeleton` on a symbol a step tags into its task — /hitl:skeleton §3
  (new stubs, and symbols an earlier task already tagged), /hitl:sync "orphan → task id", and the private helpers the
  implementer creates.
- Change a locked signature or docstring without telling the user it needs `/hitl:approve <T>`.
- Run `hitl-index approve …` without `--dry-run` as a human approval (`--by human`, or no `--by`) unless the user
  typed `/hitl:approve` in this turn. A `--dry-run` preview is allowed: it writes nothing and uses no token.
- Edit `.hitl/changes/*/notes.md` (only `hitl-index note add|apply` and `/hitl:approve` write it), or add
  `--ack`, or run the `reopen`, `dismiss` or `defer` approve forms unless the user typed them.
- Write any of the files above from Bash either (`sed -i`, `>`/`>>`, `tee`, `cp`/`mv`/`rm`, `perl -i`, inline
  python/node). The PreToolUse hook denies the obvious forms as a backstop, not a guarantee: indirect writes (a
  variable path, `cd` then a relative name, a script on disk) are not caught and are still forbidden. Reading them
  (`cat`, `grep`, `jq`, `git diff`) is fine; changes go through `hitl-index`.
- Edit another change's files to carry this change's impact: it reaches the other change only as a note there
  (`hitl-index note add --change <other> --source <this>`, after the user's `--before` or Y — in a brief, its own `Y`
  under the `_To <P>:_` question, never the round's accept-all line; `other-changes.md` §3).
- Decide which change goes first, or write a note with `--source` the user did not ask for: the order is the user's
  call. The only automatic rule: a note from B blocks all of A until B is archived (`other-changes.md` §5).
- Run `hitl-index approve … --by human-override` unless the user typed `/hitl:implement <T> --lane fast` (or
  `--feature <change-id> --lane fast`) for that task. Never suggest `--lane fast` to get past a gate.
- Use line numbers in ids, docs or tasks. Refer to symbols as `Class.method` or `path#Class.method`.

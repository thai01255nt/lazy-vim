---
name: setup
description: Initializes or reconfigures the HITL workflow in the current project, creating .hitl (config, docs, index, reviews; specs/changes/archive on first use), detecting test/lint/typecheck commands, building the first code index, and optionally installing the git pre-commit drift check. Use when the user says "setup hitl", "init", or when another hitl skill reports the project is not initialized.
argument-hint: "[--reconfigure]"
disable-model-invocation: true
allowed-tools: Read Glob Grep Bash(hitl-index *) Bash(node *hitl-index.mjs *) Bash(git rev-parse *) Bash(git ls-files *)
---

# /hitl:setup

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md` (language, CLI fallback, gate protocol).

Arguments: `$ARGUMENTS` (`--reconfigure` = re-show and edit the detected commands; init itself is idempotent either way).

## Turn 1 — initialize and show

1. `git rev-parse --show-toplevel` (ignore failure). Work from the repo root if there is one, else the cwd. Say which in one line.
2. Legacy check (≤ 0.3 projects): if `.claude/custom/hitl.config.json` exists and `.hitl/` does not (init also exits 1
   with `legacy: true`), run 🔍 `hitl-index migrate --dry-run`, print its plan, then ⛔ GATE:
   `1. 💡 Migrate .claude/custom/ → .hitl/ (Y)  2. Keep the old dir (hitl stays inactive)  3. Start an empty .hitl/ (init --fresh)`.
   END THE TURN. On 1: 📝 `hitl-index migrate`, print its output (incl. the `git add -A` hint and files left in place),
   then continue with step 3. On 3: `hitl-index init --fresh --json`. Never move the dir by hand.
2b. v0.5 planning check: if `.hitl/planning/*.md` exists, run 🔍 `hitl-index migrate --specs --dry-run --json` and add its
   `plan[]` table (`planning → change | capability | key | target`) + `warnings` to the gate of step 5 as option 4
   `Migrate v0.5 planning to changes (Y/rename "4 1 accounts ACC"/skip)` — 💡 recommend business-area names
   (`accounts`/`ACC`) over the derived slug. On yes: `hitl-index migrate --specs --map '<json>' --json`
   (`{"<name>":{"capability","key"}}` per row); exit 1 → print its conflicts. Crude migrated titles are polished later
   by the rename round of `/hitl:plan` (mention it in one line).
3. 📝 `hitl-index init --json`. It is idempotent: creates missing dirs, config and `.gitignore`, never overwrites md files.
   Output: `{created:[…], config:{…}, detected:{ts:{runner,confidence}, py:{runner,confidence}}}`.
   - Exit ≠ 0 → print ❌ with stderr and stop.
4. 🔍 `hitl-index index --all --json`. Summarize: files, symbols, parse warnings (max 5 + count; the informational
   `GENERIC_APPROX` / `ADAPTER_LANG` codes are only counted, never listed).
   - Languages: the output has `languages: {<lang>: {files, enabled, adapter, note}}` (every built-in language found
     in the repo). Print one line per language from `note`, e.g.
     `kotlin (173 files) → generic@1 (approx; install universal-ctags for better symbol discovery)`.
     Adapters: `ts-compiler` / `ts-lite` (TS/JS), `py-ast` (Python), `ctags@1+<ver>` (Universal Ctags discovery),
     `generic@1` (built-in table: Java, Kotlin, Scala, Groovy, Go, Rust, C, C++, C#, Swift, PHP, Ruby, Dart, Lua,
     Shell, SQL, Elixir, Nim). ctags/generic results are approximate (regex + brace/`end`/indent matching, name-based calls).
   - `enabled: false` → the config lists languages explicitly; offer `hitl-index init --set 'languages=["*"]'`
     (or add the language ids). `"!<lang>"` excludes one; `adapters.<lang>` = `generic` | `ctags` | `none` overrides.
   - `ts-lite` in use → `💡 Install typescript in the project for the exact TS adapter (ts-lite is an approximation).`
   - any language on `generic@1` → once: `💡 Install universal-ctags (built with +json) for better symbol discovery.`
5. ⛔ GATE. Print:

```
✅ HITL initialized: .hitl/  (created: <n> items | already existed)
📊 Index: <files> files · <symbols> symbols · warnings: <n>
🗂️ Languages:
   ts (12 files) → ts-lite@1 (approx; install typescript for the exact adapter)
   kotlin (173 files) → generic@1 (approx; install universal-ctags for better symbol discovery)

| command   | lang | value                              | confidence |
|-----------|------|------------------------------------|------------|
| test      | ts   | npx vitest run --reporter=junit …  | ✅ high    |
| test      | py   | python3 -m pytest -q --junitxml …  | ⚠️ low     |
| lint      | —    | npm run lint                       | ✅         |
| typecheck | —    | (not configured)                   | —          |

1. 💡 Keep commands (Y)
2. Edit — type e.g. `test.ts = npx jest --ci …` or `typecheck = npx tsc --noEmit -p .`
3. Install git pre-commit drift check? (y/N)
<4. Migrate v0.5 planning … (only when step 2b found files)>
Reply e.g. "Y", "2 test.py = …", "1 3", "1 4".
```
   Mark low-confidence or missing commands ⚠️ and give the one-line reason (e.g. `jest-junit not installed`).
   Placeholders `{junit}` and `{files}` must stay in test commands; tell the user if their edit drops them.
   END THE TURN.

## Turn 2 — apply the reply

6. Edits: for each, `hitl-index init --set commands.test.ts="<cmd>"` (keys: `commands.test.ts`, `commands.test.py`,
   `commands.lint`, `commands.typecheck`, `commands.mutation.ts`, `commands.mutation.py`). Use `null` to clear.
   Then `hitl-index init --json` once more and show the final command table (no new gate).
7. Pre-commit opt-in (only if the user said yes to 3):
   - `.husky/` exists → `hitl-index install-git-hook --husky`, else `hitl-index install-git-hook`.
   - Print ✅ with the hook path and: `It runs hitl-index precommit (blocks only on DELETED_REFERENCED / forged status). Uninstall: hitl-index install-git-hook --uninstall`.
8. 🎯 Next:
   - Any of `docs/BUSINESS-CONTEXT.md`, `ARCHITECTURE.md`, `PATTERNS-CONVENTIONS.md` missing or still template → `/hitl:overview`
   - Else → `/hitl:plan <what you want to build>`
   - Always add one line: `ℹ️ Commit: hitl.config.json, docs/, specs/, changes/, archive/, tasks/,
     index/skeleton.lock.json, <provider>.map.json (linear|jira|github), reviews/<T>.review.md, reviews/<T>/decisions.json · Ignored
     (.hitl/.gitignore): the rest of index/ and reviews/<T>/, .inbox/, .scout.json, .spec-review.json.` (`init --json` `gitignore.added` non-empty → also
     `📝 updated .hitl/.gitignore (+<n> lines)`.)
   - Run `git ls-files -ci --exclude-standard .hitl` (ignore failure / not a repo). Lists files →
     `💡 Already tracked generated files: <n>. Untrack with: git rm -r --cached <paths>`. Never run it yourself.
   - Last line: `💡 Ticket tracker (optional): Linear, Jira or GitHub Issues — install its MCP (Linear: claude mcp add
     --transport http linear-server https://mcp.linear.app/mcp · Jira: … atlassian https://mcp.atlassian.com/v1/mcp ·
     GitHub: … github https://api.githubcopilot.com/mcp/; one server per workspace/site/account), then
     /hitl:tickets init [linear|jira|github] once per repo (pins the provider, server, team/project/repo and container).`

## Notes
- Never edit `hitl.config.json` by hand; always `init --set`.
- Do not run the test command here; `/hitl:test` does that.

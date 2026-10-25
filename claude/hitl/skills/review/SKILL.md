---
name: review
description: Reviews a task's implementation against its approved skeleton with layered checks — L0 deterministic gates (tests, lint, typecheck, drift vs lock, requirement trace, mutation), L1 fresh-context reviewer subagents per risk lens with a confidence filter, and a one-screen report in .hitl/reviews — routing only high-risk items to the human and driving the fix loop. `--security-audit` runs the full Cloudflare six-phase security audit for a feature or the repo. Use when the user says "review T-12", "kiểm tra", after implementation turns green, to apply findings ("fix F-2", "amend F-2"), or a full security audit of a hitl feature ("security audit feat-x").
argument-hint: "<T-id> [fix F-n|amend F-n|recheck] [--in-feature] | --security-audit [<feature-file>|repo] [--out <dir>]"
allowed-tools: Read Glob Grep Edit Write Agent Skill Bash(hitl-index *) Bash(node *hitl-index.mjs *) Bash(git diff *) Bash(git log *) Bash(git rev-parse *) Bash(git status *) Bash(mkdir *) Bash(node *validate-findings.cjs *) Bash(node *validate-coverage-ledger.cjs *)
---

# /hitl:review

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md`. Reply in the user's language.
Lens checklists: `${CLAUDE_PLUGIN_ROOT}/skills/review/references/lenses.md`.
Fix loop: `${CLAUDE_PLUGIN_ROOT}/skills/review/references/fix-loop.md` (read before `fix`).
Amend spec: `${CLAUDE_PLUGIN_ROOT}/shared/amend-spec.md` (read before `amend`).
Security lens + full audit: `${CLAUDE_PLUGIN_ROOT}/skills/review/references/security.md` (read before a security lens or `--security-audit`).

Arguments: `$ARGUMENTS` → `<T-id>` (full review) · `<T-id> fix F-n[,F-m]` · `<T-id> recheck` ·
`--security-audit [<planning|tasks file>|repo] [--out <dir>] [--profile quick|standard|deep]` (section "Full security audit").
`--in-feature` (from `/hitl:implement --feature`): run the full review but skip step 8's gate question and the
"next frontier" line; the feature run asks once for all tasks. Low-risk PASS still auto-approves `done`.
A bare reply `accept F-1` / `reject F-2 <reason>` / `defer F-3` / `amend F-4` after a review gate is a decision (see Decisions).

Paths below are relative to the project: `R = .hitl/reviews/<T>`.

## Iron rules

- Reviewers get **crafted context only** (the review-context file + L0 + lens checklist), never this session's history.
- Review **approved skeleton → current code**, not just the diff.
- You never edit `R/*.json` or `<T>.review.md` by hand. The CLI (`report`, `review-decide`) and the review agents write them.
- Findings are claims. Only verified ones (`keep: true`) reach the human inline.
- You never approve with `--by human`. `--by auto` only for low risk + verdict PASS (the CLI enforces it).
- **Human override → L2 always.** `risk --json` `override: true` (the user forced the fast lane): every function is
  HUMAN-routed, the report carries a `⚠️ human-override` line, and `done` is only ever `/hitl:approve <T> done`.

## Full review

1. **Preconditions**: `hitl-index status <T> --json`. Task status below `green` (any symbol red/wip/skeleton) →
   ⚠️ say so and continue anyway (the report will say FAIL); suggest `/hitl:implement <T>` at the end.
2. **L0**: `hitl-index l0 <T> --json` (writes `R/l0.json`). Note failing gates.
   If tests fail or drift has a `block` item → L1 runs **only the contract lens**.
   The `trace` gate (R → AC → test → symbol) is `fail` only on broken references (unknown R-/D-/AC ids, unresolved
   `@covers`); gaps (`AC_NOT_PROVEN`, `REQ_NO_AC`, …) make it `warn` — list them, never block on them.
3. **Lens selection**: `hitl-index risk <T> --json` (`lenses`, per-symbol reasons) and the task risk.
   - always `contract`, `tests`
   - `concurrency` if any symbol has `@concurrency` ≠ none or features ∩ {async, lock, thread, timer} or a task risk reason starts with `concurrency`
   - `security` if any symbol has a security signal (securityPaths, features ∩ {sql, shell, crypto, eval, deserialize, fs-path}),
     the task's risk reasons in the tasks md start with `security` (e.g. `risk: high (security)`; `risk --json` already lists it),
     or the task crosses a trust boundary the index cannot see (security.md §1: auth, untrusted input parsing, crypto,
     secrets, file/IPC/network, LLM/tool use, deserialization, multi-tenant data) → `💡 Assumed: security lens (…)`.
   - model: task risk high → `opus` for contract and concurrency; everything else `sonnet`.
   - `override: true` → all four lenses regardless of signals (`risk --json` lists all four), `opus` for contract.
4. **Review context**: `hitl-index context <T> --out .hitl/reviews/<T>/review-context.md`
   (approved lock entries vs current code, callers, tests, ACs).
5. **L1 — parallel reviewers**: in **one message**, spawn one `hitl:reviewer` per lens (Agent tool,
   `subagent_type: hitl:reviewer`, `model` per step 3). Prompt, nothing else:
   ```
   Lens: <lens>. Task: <T>.
   Review context: .hitl/reviews/<T>/review-context.md   L0: .hitl/reviews/<T>/l0.json
   Checklist: ${CLAUDE_PLUGIN_ROOT}/skills/review/references/lenses.md — sections "Common rules" and "<lens>".
   Write findings JSON (schema hitl.findings/1) to .hitl/reviews/<T>/findings-<lens>.json, then return the summary JSON.
   ```
   Security lens: add the line `Security method: ${CLAUDE_PLUGIN_ROOT}/skills/review/references/security.md §2–3 (upstream attack-class docs, guidance mode).`
6. **Verify**: read `review.confidenceThreshold` from `.hitl/hitl.config.json` (default 80). Spawn **one**
   `hitl:finding-verifier` (haiku) with: the list of `R/findings-<lens>.json` files that exist, the review-context path,
   the threshold, and the output path `R/findings.json`. If a reviewer failed to write its file, note `⚠️ <lens> lens missing`
   and continue with the others.
7. **Report**: `hitl-index report <T> --json` (writes `.hitl/reviews/<T>.review.md`, records the review).
   Print the report's top block: verdict line (and the `⚠️ human-override` line when present), Gates table, the `## Trace` block, Functions table, and the
   "Findings needing a decision" cards (a card may carry `spec: D-1 · R-1` and the `amend F-n` hint).
   Mention the collapsed count (minor / below threshold) without listing them.
8. **Gate or finish**:
   - `human required > 0` → run the Linear block (step 9) first, then ⛔ GATE
     `Decide: F-1 (accept/reject/defer/amend), F-2 … — or "fix F-1". HUMAN-routed functions: open <file> beside the report.`
     End turn. (`amend` is offered for findings with a `spec:` line and category intent, scope or todo-flow.)
   - else, verdict PASS: risk low → `hitl-index approve <T> --stage done --by auto`, print ✅ and the next frontier task
     (`hitl-index status --json` `.next`). Risk high → ✅ and `🎯 next: /hitl:approve <T> done`.
   - verdict FAIL (tests/drift/trace block) with nothing for the human to decide → 🛑 print the failing gates and
     `🎯 next: /hitl:implement <T>` (red tests), `/hitl:sync` (drift or trace references).
9. **Linear (optional, fail-open)** — once per full review or recheck, as the last step (before the gate question when
   there is one): `hitl-index tickets status --json`. If `enabled && configured && autoPush.onReview` → invoke the Skill
   `hitl:tickets` with `push <T> --auto` (upserts the verdict comment and state). If the task is mapped and the verdict is
   PASS, print its `prLine` (e.g. `PR: Fixes ENG-123`). Command missing, error, or anything else → skip silently; it never
   changes the verdict, the gate or this skill's result.

## Decisions (reply to the gate)

For each item in the reply: `hitl-index review-decide <T> F-n accept|reject|defer [--note "<reason>"]`.
`reject` should carry the user's reason as `--note` (it feeds the precision log in the report's Outcome log).
Then `hitl-index report <T> --json` and print the new verdict line. Accepted items → offer `fix F-n` (or run it if the
user said "fix").

`amend F-n` = accept + amend the spec:
1. `hitl-index review-decide <T> F-n accept --note "amend spec"`.
2. Follow `shared/amend-spec.md` with `R/l0.json` `trace.spec[<finding symbol>]` as the spec block (missing → the task's
   planning and the finding text): 📐 Spec delta, ⛔ GATE `Apply? (Y/n/edit)`, END THE TURN.
3. On Y apply it; if the locked contract must change too, print what changes in the skeleton and
   `🎯 next: edit the skeleton, then /hitl:approve <T> skeleton <symbols>`. Then `hitl-index report <T> --json`.
Also offer `amend F-n` when the human accepts a contract finding that implies a different design.

## `fix F-n[,F-m]`

Follow `references/fix-loop.md`. Summary:
1. Read `.hitl/reviews/<T>.review.md` and `R/findings.json` to map F-n → finding `key`. Unknown F-n → list valid ones.
2. Record `accept` via `review-decide` if not already decided.
3. Route by owner:
   - `@impl agent` symbol + reproducible behaviour → **test first**: `hitl:test-author` writes a failing test for the finding
     (contract pack + finding text) → fresh run shows it red → `hitl:implementer` makes it green (slice via
     `hitl-index context <ref> --out .hitl/index/contracts/<T>.impl.md`) → fresh `hitl-index test --task <T> --json`.
   - `@impl manual` symbol → print the finding as a ✍️ TODO card for the human (file:line, evidence, suggested fix). Never edit it.
   - contract / intent / scope findings (category intent, todo-flow, scope) → human: they may need a skeleton change +
     `/hitl:approve <T>`. Print what would change and offer `amend F-n`; do not edit locked signatures or docstrings.
4. Max `review.maxFixRounds` (default 2) rounds per finding; then 🛑 escalate with the evidence.
5. After fixes: run **recheck** (below).

## `recheck` (incremental)

1. `hitl-index l0 <T> --json`.
2. `hitl-index risk <T> --changed-since-review --json` → symbols whose bodyHash changed since the last review.
   None changed and L0 unchanged → print the existing verdict, stop.
3. Regenerate the review context (step 4) and rerun L1 only for the lenses that apply to the changed symbols
   (tell each reviewer: `Focus symbols: <ids>`).
4. Verifier: pass the new lens files **and** the previous `R/findings.json` so findings on unchanged symbols are carried
   over unchanged; findings on changed symbols come only from the new lens files.
5. `hitl-index report <T> --json`, then steps 8–9. The Outcome log shows "fixed, re-review pass" for keys that disappeared.

## Full security audit (`--security-audit`)

Follow `references/security.md` §4: scope (feature tasks' files, or the repo) → output dir (upstream default outside
the project unless `--out`) → invoke the Skill `hitl:security-audit` in full audit mode → in a feature context record
the link with `hitl-index feature <file> --report --security-audit <dir> --json` → print verdict counts and the
`REPORT.md` path. `Write` is only for the audit output dir. It never edits target source and never changes a task's
review verdict.

## Second opinions (optional, suggest only)

- Built-in `/code-review` on the diff as an extra lens (it does not know the skeleton/lock, so it never replaces the contract lens).
- `/security-review` when the security lens ran and the task touches auth/crypto/money.
- `/hitl:review --security-audit <feature-file>` (full six-phase audit) when several tasks of a feature had the security lens.

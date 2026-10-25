#!/usr/bin/env bash
# End-to-end test for the hitl plugin (design §G.4).
# Exercises the hitl-index CLI and the hook scripts on copies of tests/fixtures/{ts-app,py-app}.
#
# Usage: tests/e2e.sh [--update-golden] [--keep] [--no-claude] [--continue]
#   --update-golden  write tests/golden/*.symbols.json instead of diffing against them
#   --keep           keep the temp work dir (printed at the end)
#   --no-claude      skip step 25 (claude plugin validate)
#   --continue       keep going after a failed step (default: stop at the first failure)
# Output: one line per step, "ok <n> <desc>" or "not ok <n> <desc>" followed by the step log.
# Exit code: 0 all steps ok, 1 a step failed.
set -euo pipefail

H="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"   # plugin root
CLI_JS="$H/scripts/hitl-index.mjs"
HOOKS="$H/scripts/hooks"
FIX="$H/tests/fixtures"
GOLDEN="$H/tests/golden"

UPDATE_GOLDEN=0; KEEP=0; NO_CLAUDE=0; CONTINUE=0
for a in "$@"; do
  case "$a" in
    --update-golden) UPDATE_GOLDEN=1 ;;
    --keep) KEEP=1 ;;
    --no-claude) NO_CLAUDE=1 ;;
    --continue) CONTINUE=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

W="$(mktemp -d "${TMPDIR:-/tmp}/hitl-e2e.XXXXXX")"
TS="$W/ts-app"; PY="$W/py-app"; EMPTY="$W/empty"; LOGS="$W/logs"
mkdir -p "$EMPTY" "$LOGS"
cleanup() { if [ "$KEEP" = 1 ]; then echo "# work dir kept: $W"; else rm -rf "$W"; fi; }
trap cleanup EXIT

export HITL_E2E=1
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null   # deterministic git
CLI() { node "$CLI_JS" "$@"; }

# ---------------------------------------------------------------- assertion helpers
# assert.mjs: reads JSON from stdin, evaluates a JS expression with `d` bound to it.
# Helpers available inside the expression: has(arr, x), sym(d, suffix), taskStatus(d, T), symStatus(d, suffix).
cat > "$W/assert.mjs" <<'EOF'
import { readFileSync } from "node:fs";
const expr = process.argv[2];
const raw = readFileSync(0, "utf8");
let d;
try { d = raw.trim() === "" ? null : JSON.parse(raw); }
catch (e) { console.error("not JSON: " + raw.slice(0, 400)); process.exit(1); }
const has = (arr, x) => Array.isArray(arr) && arr.includes(x);
const pick = (obj, suffix) => {
  if (!obj || typeof obj !== "object") return undefined;
  const k = Object.keys(obj).find((k) => k === suffix || k.endsWith("#" + suffix));
  return k === undefined ? undefined : obj[k];
};
const sym = (d, suffix) => pick(d && d.symbols, suffix);
const statusOf = (v) => (v && typeof v === "object" ? v.status : v);
const taskStatus = (d, t) => {
  if (!d) return undefined;
  if (d.tasks && !Array.isArray(d.tasks) && d.tasks[t]) return statusOf(d.tasks[t]);
  if (Array.isArray(d.tasks)) { const x = d.tasks.find((x) => x.id === t || x.task === t); if (x) return x.status; }
  if ((d.id === t || d.task === t) && d.status) return statusOf(d.status);
  return undefined;
};
const symStatus = (d, suffix) => statusOf(pick(d && d.perSymbol, suffix) ?? pick(d && d.symbols, suffix));
let ok;
try { ok = new Function("d", "has", "sym", "taskStatus", "symStatus", `return (${expr});`)(d, has, sym, taskStatus, symStatus); }
catch (e) { console.error(`assert threw: ${expr}\n${e.message}`); ok = false; }
if (!ok) {
  console.error(`assert failed: ${expr}`);
  console.error("input: " + JSON.stringify(d, null, 1).slice(0, 1500));
  process.exit(1);
}
EOF
aj() { node "$W/assert.mjs" "$1"; }                 # aj '<expr>' < json
afile() { aj "$2" < "$1"; }                         # afile <json file> '<expr>'
contains() { grep -qF -- "$2" "$1" || { echo "expected '$2' in $1:"; head -c 1500 "$1"; echo; return 1; }; }
expect_exit() { # expect_exit <code> cmd...
  local want="$1"; shift; local rc=0; "$@" || rc=$?
  [ "$rc" = "$want" ] || { echo "expected exit $want, got $rc: $*"; return 1; }
}
# run a hook: hook <name> <stdin-json> <stdout-file>; exit code must be 0
hook() { local rc=0; printf '%s' "$2" | node "$HOOKS/$1.mjs" > "$3" || rc=$?; [ "$rc" = 0 ] || { echo "hook $1 exited $rc"; cat "$3"; return 1; }; }
empty_out() { [ ! -s "$1" ] || { echo "expected empty stdout, got:"; cat "$1"; return 1; }; }
is_deny() { aj 'd && d.hookSpecificOutput && d.hookSpecificOutput.permissionDecision === "deny"' < "$1"; }
is_allow() { aj 'd && d.hookSpecificOutput && d.hookSpecificOutput.permissionDecision === "allow"' < "$1"; }
# build JSON from k=v args with node (avoids shell quoting): js '{...expression using env E1..}'
js() { node -e "process.stdout.write(JSON.stringify($1))"; }

LOCK=.hitl/index/skeleton.lock.json
IDX=.hitl/index/index.json

# ---------------------------------------------------------------- step runner
PASS=0; FAILN=0
step() { # step <n> <desc> <function>
  local n="$1" desc="$2" fn="$3" rc=0
  set +e
  ( set -euo pipefail; "$fn" ) > "$LOGS/$n.log" 2>&1
  rc=$?
  set -e
  if [ "$rc" = 0 ]; then
    if grep -q '^SKIP:' "$LOGS/$n.log"; then echo "ok $n $desc # SKIP $(grep '^SKIP:' "$LOGS/$n.log" | head -1 | cut -c7-)"
    else echo "ok $n $desc"; fi
    PASS=$((PASS + 1))
  else
    echo "not ok $n $desc"
    sed 's/^/#   /' "$LOGS/$n.log" | tail -n 40
    FAILN=$((FAILN + 1))
    if [ "$CONTINUE" = 0 ]; then echo "# stopped at step $n (use --continue to run the rest)"; echo "# passed $PASS, failed $FAILN"; exit 1; fi
  fi
}

# ---------------------------------------------------------------- preflight
pre() {
  command -v node >/dev/null || { echo "node not found"; return 1; }
  node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=18)?0:1)' \
    || { echo "Node >= 22.18 required (TS type stripping), have $(node --version)"; return 1; }
  command -v python3 >/dev/null || { echo "python3 not found"; return 1; }
  command -v git >/dev/null || { echo "git not found"; return 1; }
  [ -f "$CLI_JS" ] || { echo "missing $CLI_JS (package P1 not landed yet)"; return 1; }
  for h in common pre-tool post-edit stop session-start prompt-submit; do
    [ -f "$HOOKS/$h.mjs" ] || { echo "missing $HOOKS/$h.mjs (package P3 not landed yet)"; return 1; }
  done
  for c in init index drift context tasks next-id; do
    [ -f "$H/scripts/cmd/$c.mjs" ] || { echo "missing scripts/cmd/$c.mjs (P1)"; return 1; }
  done
  for c in approve status test l0 report precommit; do
    [ -f "$H/scripts/cmd/$c.mjs" ] || { echo "missing scripts/cmd/$c.mjs (P2)"; return 1; }
  done
  for app in ts-app py-app; do
    cp -R "$FIX/$app" "$W/$app"
    rm -rf "$W/$app/.hitl/index"
    git -C "$W/$app" init -q
  done
}
step 0 "preflight (node, python3, git, CLI + hooks present; fixtures copied to temp dir)" pre

# ================================================================ TS
s1() {
  cd "$TS"
  CLI init --json > "$W/init.json"
  [ -f .hitl/hitl.config.json ] || { echo "config not created"; return 1; }
  cmp .hitl/tasks/feat-user-register.md "$FIX/ts-app/.hitl/tasks/feat-user-register.md"
  cmp .hitl/planning/feat-user-register.md "$FIX/ts-app/.hitl/planning/feat-user-register.md"
}
step 1 "init: config created, tasks/planning md untouched" s1

s1a() {
  cd "$TS"
  local gi=.hitl/.gitignore l
  for l in 'index/*' '!index/skeleton.lock.json' 'reviews/*/*' '!reviews/*/decisions.json' '.inbox/'; do grep -qxF -- "$l" "$gi" || { echo "missing '$l' in $gi"; cat "$gi"; return 1; }; done
  git check-ignore -q .hitl/reviews/T-1/l0.json || { echo "reviews/T-1/l0.json not ignored"; return 1; }
  for l in .hitl/reviews/T-1/decisions.json .hitl/reviews/T-1.review.md .hitl/linear.map.json "$LOCK"; do
    ! git check-ignore -q "$l" || { echo "$l must not be ignored"; return 1; }
  done
}
step 1a "init .gitignore: generated files ignored; lock, decisions.json, review md, linear.map.json committed" s1a

s2() {
  cd "$TS"
  CLI index --all --json > "$W/ts-index-out.json"
  afile "$W/ts-index-out.json" 'd && d.schema'
  afile "$IDX" 'd.schema === "hitl.index/1" && !!d.symbols["src/services/userService.ts#UserService.createUser"]'
  afile "$IDX" 'd.symbols["src/repo/userRepo.ts#UserRepo.findByEmail"].tags.impl === "manual" && d.symbols["src/repo/userRepo.ts#UserRepo.findByEmail"].stub === true'
  cp "$IDX" "$W/ts-index.pristine.json"
}
step 2 "index --all: UserService.createUser indexed, findByEmail is a manual stub" s2

s3() {
  cd "$TS"
  CLI index --all > /dev/null
  cmp "$IDX" "$W/ts-index.pristine.json" || { echo "index.json differs between two --all runs"; diff <(node -e 'console.log(JSON.stringify(require(process.argv[1]),null,1))' "$W/ts-index.pristine.json") <(node -e 'console.log(JSON.stringify(require(process.argv[1]),null,1))' "$PWD/$IDX") | head -30; return 1; }
}
step 3 "index --all twice: index.json byte-identical (determinism)" s3

s4() {
  cd "$TS"
  afile "$IDX" 'has(d.symbols["src/services/userService.ts#UserService.createUser"].callers, "src/http/authController.ts#register")'
  CLI context UserService.createUser --json > "$W/ctx.json"
  afile "$W/ctx.json" 'typeof d.markdown === "string" && d.markdown.includes("src/services/userService.ts") && d.markdown.includes("register") && d.markdown.includes("UserRepo.findByEmail")'
  afile "$W/ctx.json" '!/\.ts:\d+/.test(d.markdown)'   # no line numbers in slices (§0.3)
}
step 4 "context UserService.createUser: callers ∋ register, callees ∋ UserRepo.findByEmail, no line numbers" s4

s5() { cd "$TS"; CLI tasks --check; }
step 5 "tasks --check: exit 0" s5

s5a() {
  cd "$TS"
  CLI trace --json > "$W/trace5.json"
  afile "$W/trace5.json" 'd.schema === "hitl.trace/1" && d.counts.block === 0 && d.rows.some((r) => r.req && r.req.id === "R-1" && r.acs.some((a) => a.id === "T-1.AC1"))'
  local md=.hitl/tasks/feat-user-register.md
  sed -i 's/T-1.AC1 (R-1)/T-1.AC1 (R-9)/' "$md"
  expect_exit 1 CLI trace --check
  expect_exit 1 CLI tasks --check
  cp "$FIX/ts-app/$md" "$md"
  CLI tasks --check > /dev/null
}
step 5a "trace --json: R-1 row holds T-1.AC1, no block; unknown (R-9) fails trace --check and tasks --check" s5a

s6() {
  cd "$TS"
  expect_exit 1 CLI approve T-1 --by auto
  [ ! -f "$LOCK" ] || afile "$LOCK" '!d.symbols || Object.keys(d.symbols).length === 0'
}
step 6 "approve T-1 --by auto: refused (high risk), nothing locked" s6

s7() {
  cd "$TS"
  CLI approve T-1 --stage skeleton --by human --json > "$W/approve1.json"
  afile "$LOCK" 'd.schema === "hitl.lock/1" && Object.keys(d.symbols).length === 2'
  afile "$LOCK" '!!d.symbols["src/services/userService.ts#UserService.createUser"] && !!d.symbols["src/repo/userRepo.ts#UserRepo.findByEmail"]'
  CLI status T-1 --json > "$W/status7.json"
  afile "$W/status7.json" 'taskStatus(d, "T-1") === "approved"'
}
step 7 "approve T-1 skeleton --by human: 2 symbols locked, T-1 approved" s7

s8() {
  cd "$TS"
  cp variants/tests/userService.test.ts.red tests/userService.test.ts
  CLI index > /dev/null
  CLI test --task T-1 --json > "$W/test8.json"
  afile "$W/test8.json" 'symStatus(d, "UserService.createUser") === "red"'
  afile "$W/test8.json" 'Array.isArray(d.unmatched) && d.unmatched.length === 0'
}
step 8 "real tests (red variant): createUser red, no unmatched JUnit cases" s8

s9() {
  cd "$TS"
  CLI approve T-1 --stage tests --by human > /dev/null
  afile "$LOCK" 'Object.keys(d.tests).length >= 2 && Object.values(d.tests).every((t) => t.stage === "locked")'
}
step 9 "approve T-1 tests: lock.tests stage locked" s9

s10() {
  cd "$TS"
  cp variants/src/services/userService.ts.green src/services/userService.ts
  CLI index > /dev/null
  CLI test --task T-1 --json > "$W/test10.json"
  afile "$W/test10.json" 'symStatus(d, "UserService.createUser") === "red"'
}
step 10 "agent implements createUser: still red (findByEmail stub throws)" s10

s11() {
  cd "$TS"
  cp variants/src/repo/userRepo.ts.manual src/repo/userRepo.ts
  CLI index > /dev/null
  CLI test --task T-1 --json > "$W/test11.json"
  afile "$W/test11.json" 'symStatus(d, "UserService.createUser") === "green" && symStatus(d, "UserRepo.findByEmail") === "green"'
}
step 11 "human implements findByEmail: createUser green, findByEmail green" s11

s11a() {
  cd "$TS"
  CLI trace T-1 --json > "$W/trace11.json"
  afile "$W/trace11.json" 'd.scope.kind === "task" && d.rows.flatMap((r) => r.acs).every((a) => a.proven) && !d.items.some((i) => i.code === "AC_NOT_PROVEN")'
  CLI status --json > "$W/status11.json"
  afile "$W/status11.json" 'd.trace && d.trace.block === 0 && d.tasks["T-1"].trace.acs.proven === 2'
  CLI trace --md > /dev/null
  contains .hitl/index/trace.md "R-1"
}
step 11a "trace T-1: every AC proven; status --json trace; trace --md writes index/trace.md" s11a

s12() {
  cd "$TS"
  local in; in=$(P="$PWD" js '{session_id:"e2e-12",cwd:process.env.P,hook_event_name:"PreToolUse",tool_name:"Edit",tool_input:{file_path:process.env.P+"/src/repo/userRepo.ts",old_string:"toLowerCase()",new_string:"toUpperCase()"}}')
  hook pre-tool "$in" "$W/h12.json"
  is_deny "$W/h12.json"
}
step 12 "pre-tool: agent Edit of locked @impl manual body is denied" s12

s13() {
  cd "$TS"
  local in
  in=$(P="$PWD" js '{session_id:"e2e-13",cwd:process.env.P,hook_event_name:"PreToolUse",tool_name:"Edit",tool_input:{file_path:process.env.P+"/tests/userService.test.ts",old_string:"assert.equal(user.email, \"new@x.io\");",new_string:"assert.equal(user.email, \"other@x.io\");"}}')
  hook pre-tool "$in" "$W/h13a.json"
  is_deny "$W/h13a.json"
  in=$(P="$PWD" js '{session_id:"e2e-13",cwd:process.env.P,hook_event_name:"PreToolUse",agent_type:"hitl:test-author",agent_id:"a1",tool_name:"Edit",tool_input:{file_path:process.env.P+"/tests/userService.test.ts",old_string:"assert.equal(user.email, \"new@x.io\");",new_string:"assert.equal(user.email, \"other@x.io\");"}}')
  hook pre-tool "$in" "$W/h13b.json"
  empty_out "$W/h13b.json"
}
step 13 "pre-tool: locked test Edit denied for main, allowed for hitl:test-author" s13

s14() {
  cd "$TS"
  local in
  in=$(P="$PWD" js '{session_id:"e2e-14",cwd:process.env.P,hook_event_name:"PreToolUse",agent_type:"hitl:test-author",agent_id:"a1",tool_name:"Read",tool_input:{file_path:process.env.P+"/src/services/userService.ts"}}')
  hook pre-tool "$in" "$W/h14a.json"
  is_deny "$W/h14a.json"
  in=$(P="$PWD" js '{session_id:"e2e-14",cwd:process.env.P,hook_event_name:"PreToolUse",agent_type:"hitl:test-author",agent_id:"a1",tool_name:"Read",tool_input:{file_path:process.env.P+"/tests/userService.test.ts"}}')
  hook pre-tool "$in" "$W/h14b.json"
  empty_out "$W/h14b.json"
}
step 14 "pre-tool: test-author Read of src denied, Read of tests allowed" s14

s15() {
  cd "$TS"
  local in
  in=$(P="$PWD" js '{session_id:"e2e-15",cwd:process.env.P,hook_event_name:"UserPromptSubmit",prompt:"/hitl:approve T-1"}')
  hook prompt-submit "$in" "$W/h15p.txt"
  in=$(P="$PWD" js '{session_id:"e2e-15",cwd:process.env.P,hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:"hitl-index approve T-1 --by human"}}')
  hook pre-tool "$in" "$W/h15a.json"
  is_allow "$W/h15a.json"
  hook pre-tool "$in" "$W/h15b.json"
  is_deny "$W/h15b.json"
}
step 15 "approve token: /hitl:approve prompt allows one Bash approve --by human, the second is denied" s15

s16() {
  cd "$TS"
  cp variants/src/services/userService.ts.sigchange src/services/userService.ts
  local in
  in=$(P="$PWD" node -e 'const fs=require("fs");const P=process.env.P;const f=P+"/src/services/userService.ts";process.stdout.write(JSON.stringify({session_id:"e2e-16",cwd:P,hook_event_name:"PostToolUse",tool_name:"Write",tool_input:{file_path:f,content:fs.readFileSync(f,"utf8")},tool_response:{filePath:f,success:true}}))')
  hook post-edit "$in" "$W/h16.json"
  afile "$W/h16.json" 'd.hookSpecificOutput.hookEventName === "PostToolUse" && d.hookSpecificOutput.additionalContext.includes("SIG_CHANGED") && d.hookSpecificOutput.additionalContext.includes("register")'
}
step 16 "post-edit: signature change reports SIG_CHANGED with affected caller register" s16

s17() {
  cd "$TS"
  CLI drift --fail-on block --json > "$W/drift17.json"
  afile "$W/drift17.json" 'd.summary.block === 0 && d.items.some((i) => i.code === "SIG_CHANGED")'
}
step 17 "drift --fail-on block: exit 0 (SIG_CHANGED is warn only)" s17

s17a() {
  cd "$TS"
  CLI drift --json > "$W/drift17a.json"
  afile "$W/drift17a.json" '(() => { const i = d.items.find((x) => x.code === "SIG_CHANGED" && x.symbol.endsWith("#UserService.createUser")); const r = (i && i.spec && i.spec.requirements || []).map((x) => x.id); return i && i.spec.decisions[0].id === "D-1" && has(r, "R-1") && has(r, "R-2"); })()'
}
step 17a "drift --json: SIG_CHANGED on createUser carries spec D-1 and R-1, R-2" s17a

s18() {
  cd "$TS"
  mkdir -p .hitl/reviews/T-1
  cat > .hitl/reviews/T-1/findings.json <<'EOF'
{ "schema": "hitl.findings/1", "task": "T-1", "lens": "merged",
  "findings": [
    { "key": "contract-1", "lens": "contract", "symbol": "src/services/userService.ts#UserService.createUser",
      "file": "src/services/userService.ts", "line": 21, "severity": "minor", "confidence": 70, "verifiedConfidence": 60, "keep": false,
      "category": "scope", "title": "Unused role parameter", "evidence": "role is never read", "suggestedFix": "remove role or use it", "fixOwner": "human" } ],
  "setAside": [ "id generation strategy: not in plan" ] }
EOF
  local rc=0
  CLI l0 T-1 --json > "$W/l0.json" || rc=$?
  [ "$rc" = 0 ] || [ "$rc" = 1 ] || { echo "l0 exited $rc"; return 1; }
  [ -f .hitl/reviews/T-1/l0.json ] || { echo "reviews/T-1/l0.json missing"; return 1; }
  afile .hitl/reviews/T-1/l0.json 'd.schema === "hitl.l0/1" && Array.isArray(d.gates)'
  CLI report T-1 > /dev/null
  contains .hitl/reviews/T-1.review.md "## Gates (L0)"
  contains .hitl/reviews/T-1.review.md "verdict:"
}
step 18 "l0 + report T-1: review md has Gates (L0) and verdict" s18

s18a() {
  cd "$TS"
  afile .hitl/reviews/T-1/l0.json 'd.gates.some((g) => g.name === "trace" && ["pass", "warn"].includes(g.result)) && d.trace && d.trace.counts.block === 0'
  contains .hitl/reviews/T-1.review.md "## Trace"
  contains .hitl/reviews/T-1.review.md "| trace |"
}
step 18a "l0 trace gate pass|warn, no block; review md has ## Trace and the trace gate row" s18a

s19() {
  cd "$TS"
  cp variants/src/repo/userRepo.ts.deleted src/repo/userRepo.ts
  local rc=0
  CLI precommit > "$W/pre19.txt" 2>&1 || rc=$?
  [ "$rc" = 1 ] || { echo "precommit exit $rc, want 1"; cat "$W/pre19.txt"; return 1; }
  contains "$W/pre19.txt" "DELETED_REFERENCED"
}
step 19 "precommit after deleting referenced findByEmail: exit 1, DELETED_REFERENCED" s19

s20() {
  cd "$EMPTY"
  local h in
  for h in pre-tool post-edit stop session-start prompt-submit; do
    hook "$h" '{}' "$W/h20-$h.out"
    empty_out "$W/h20-$h.out"
    in=$(P="$EMPTY" js '{session_id:"e2e-20",cwd:process.env.P,hook_event_name:"PreToolUse",tool_name:"Edit",tool_input:{file_path:process.env.P+"/a.ts",old_string:"a",new_string:"b"},prompt:"/hitl:approve T-1",source:"startup"}')
    hook "$h" "$in" "$W/h20b-$h.out"
    empty_out "$W/h20b-$h.out"
  done
}
step 20 "fail-open: every hook exits 0 with empty stdout outside a hitl project" s20

s20a() {
  mkdir -p "$PY/.hitl"
  printf '%s\n' index/index.json index/index.md index/.cache.json index/state.json index/.session/ index/contracts/ index/.lock > "$PY/.hitl/.gitignore"
}
step 20a "py: write a v1 .gitignore before init" s20a

# ================================================================ Python
s21() {
  cd "$PY"
  CLI init > /dev/null
  CLI index --all > /dev/null
  afile "$IDX" 'd.symbols["orders.py#apply_discount"].tags.impl === "manual" && d.symbols["orders.py#round_money"].tags.impl === "agent"'
  afile "$IDX" 'has(d.symbols["orders.py#apply_discount"].callees, "orders.py#round_money") || has(d.symbols["orders.py#apply_discount"].tags.calls, "round_money")'
  cp "$IDX" "$W/py-index.pristine.json"
}
step 21 "py init + index --all: apply_discount is @impl manual" s21

s21a() {
  cd "$PY"
  contains .hitl/.gitignore "index/index.json"
  contains .hitl/.gitignore "reviews/*/*"
  CLI trace --json > "$W/trace21.json"
  afile "$W/trace21.json" 'd.plannings[0].hasRequirements === false && d.counts.block === 0 && !d.items.some((i) => i.code === "AC_NO_REQ")'
}
step 21a "py: v1 .gitignore kept + v2 lines appended; legacy planning traces without R checks" s21a

s22() {
  cd "$PY"
  CLI approve T-2 --stage skeleton --by auto > /dev/null
  afile "$LOCK" '!!d.symbols["orders.py#apply_discount"] && !!d.symbols["orders.py#round_money"]'
  if ! python3 -c 'import pytest' 2>/dev/null; then
    afile .hitl/hitl.config.json 'String(d.commands.test.py).includes("py_unittest_junit")'
  else
    echo "pytest present: runner check skipped"
  fi
  CLI test --task T-2 --json > "$W/test22.json"
  afile "$W/test22.json" 'symStatus(d, "round_money") === "red" && symStatus(d, "apply_discount") === "red"'
  afile "$W/test22.json" 'd.runs.length >= 2 && d.runs.every((r) => r.outcome === "error" && String(r.message).includes("TODO(impl)"))'
}
step 22 "py approve T-2 --by auto (low risk) + test: both red with TODO(impl) errors" s22

s23() {
  cd "$PY"
  cp variants/orders.py.impl orders.py
  CLI index > /dev/null
  CLI test --task T-2 --json > "$W/test23.json"
  afile "$W/test23.json" 'symStatus(d, "round_money") === "green" && symStatus(d, "apply_discount") === "green"'
}
step 23 "py implemented: both green" s23

s24() {
  cd "$PY"
  CLI status --brief --soft > "$W/brief.txt"
  local n; n=$(wc -l < "$W/brief.txt")
  [ "$n" -le 3 ] || { echo "status --brief printed $n lines"; cat "$W/brief.txt"; return 1; }
  contains "$W/brief.txt" "T-2"
}
step 24 "status --brief --soft: ≤3 lines, mentions T-2" s24

# ---------------------------------------------------------------- includes (tests/e2e.d/*.sh, sourced; interface I4)
INCLUDES=0
for f in "$H"/tests/e2e.d/*.sh; do
  if [ -f "$f" ]; then INCLUDES=$((INCLUDES + 1)); . "$f"; fi
done
[ "$INCLUDES" -gt 0 ] || echo "# no tests/e2e.d/*.sh includes"

# ================================================================ Packaging
s25() {
  if [ "$NO_CLAUDE" = 1 ] || ! command -v claude >/dev/null; then echo "SKIP: claude CLI not available or --no-claude"; return 0; fi
  claude plugin validate "$H" > "$W/v1.txt" 2>&1 || { cat "$W/v1.txt"; return 1; }
  contains "$W/v1.txt" "Validation passed"
  claude plugin validate "$H/.." > "$W/v2.txt" 2>&1 || { cat "$W/v2.txt"; return 1; }
  contains "$W/v2.txt" "Validation passed"
}
step 25 "claude plugin validate: plugin and marketplace pass" s25

s26() {
  local app
  for app in ts-app py-app; do
    local src="$W/${app%-app}-index.pristine.json" out="$W/$app.symbols.json"
    node -e '
      const ix = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      const s = {};
      for (const id of Object.keys(ix.symbols).sort()) {
        const x = ix.symbols[id];
        s[id] = { sigHash: x.sigHash, bodyHash: x.bodyHash, intentHash: x.intentHash };
      }
      process.stdout.write(JSON.stringify({ schema: "hitl.golden/1", adapters: ix.adapters, symbols: s }, null, 2) + "\n");
    ' "$src" > "$out"
    if [ "$UPDATE_GOLDEN" = 1 ]; then
      mkdir -p "$GOLDEN"; cp "$out" "$GOLDEN/$app.symbols.json"; echo "wrote $GOLDEN/$app.symbols.json"
    elif [ -f "$GOLDEN/$app.symbols.json" ]; then
      diff -u "$GOLDEN/$app.symbols.json" "$out" || { echo "golden mismatch for $app (rerun with --update-golden if intended)"; return 1; }
    else
      echo "missing $GOLDEN/$app.symbols.json — run tests/e2e.sh --update-golden once and commit it"; return 1
    fi
  done
}
step 26 "golden symbols (ids + sig/body/intent hashes) match tests/golden" s26

echo "# passed $PASS, failed $FAILN"
[ "$FAILN" = 0 ]

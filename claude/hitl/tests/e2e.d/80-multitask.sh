# One function, two tasks — sourced by tests/e2e.sh (interface I4).
# T-1 builds settle() and is done; T-2 later modifies it (a `modify` row: TODO(impl) steps added, working body kept, no
# sentinel). T-2 must route through skeleton → approved → red → green on settle while T-1 stays done.
MT="$W/multitask-app"

mt_src() { # mt_src <task tags> <todo lines> <body>
  printf '/**\n * Settles a charge.\n * @task %s @impl agent @status skeleton @prio 1\n */\nexport function settle(amount: number): number {\n%s%s\n}\n' "$1" "$2" "$3" > src/settle.ts
}
mt_tests() { # mt_tests <T-2 test: todo|red|green>
  {
    printf 'import { describe, it } from "node:test";\nimport assert from "node:assert/strict";\nimport { settle } from "../src/settle.ts";\n\ndescribe("settle", () => {\n'
    printf '  /** @covers settle @ac T-1.AC1 @kind example @origin test-author */\n  it("T-1.AC1 returns the amount", () => { assert.equal(settle(5) >= 5, true); });\n'
    case "$1" in
      todo) printf '  /** @covers settle @ac T-2.AC1 @kind example @origin skeleton */\n  it.todo("T-2.AC1 adds the fee");\n' ;;
      *) printf '  /** @covers settle @ac T-2.AC1 @kind example @origin test-author */\n  it("T-2.AC1 adds the fee", () => { assert.equal(settle(5), 6); });\n' ;;
    esac
    printf '});\n'
  } > tests/settle.test.ts
}

sM1() {
  mkdir -p "$MT/src" "$MT/tests" "$MT/.hitl/tasks"
  cd "$MT"
  git init -q
  printf '{"name":"multitask-app","private":true,"type":"module","scripts":{"test":"node --test"}}\n' > package.json
  cat > .hitl/tasks/feat-settle.md <<'EOF'
# Settle Tasks
> status: approved

## T-1 Settle the amount
- prio: P0 | risk: high (data) | impl: agent | blocked-by: none | status: todo
**Why**: base settle

### Acceptance criteria
- [ ] T-1.AC1 Given 5 When settle Then at least 5

### Symbols
1. [ ] `settle` | new | `src/settle.ts` | impl: agent | settle the amount

## T-2 Add the fee
- prio: P1 | risk: high (data) | impl: agent | blocked-by: T-1 | status: todo
**Why**: fee on top

### Acceptance criteria
- [ ] T-2.AC1 Given 5 When settle Then 6

### Symbols
1. [ ] `settle` | modify | `src/settle.ts` | impl: agent | add the fee
EOF
  mt_src "T-1" '  // TODO(impl): 1. return the amount
' '  throw new Error("TODO(impl): settle");'
  printf 'import { describe, it } from "node:test";\nimport assert from "node:assert/strict";\nimport { settle } from "../src/settle.ts";\n\ndescribe("settle", () => {\n  /** @covers settle @ac T-1.AC1 @kind example @origin test-author */\n  it("T-1.AC1 returns the amount", () => { assert.equal(settle(5) >= 5, true); });\n});\n' > tests/settle.test.ts
  CLI init --quiet
  CLI index --all --quiet
  CLI approve T-1 --stage skeleton --by human > /dev/null
  CLI test --task T-1 --json > "$W/m1a.json"
  afile "$W/m1a.json" 'symStatus(d, "settle") === "red"'
  CLI approve T-1 --stage tests --by human > /dev/null
  mt_src "T-1" '  // 1. return the amount
' '  return amount;'
  CLI index > /dev/null
  CLI test --task T-1 --json > "$W/m1b.json"
  afile "$W/m1b.json" 'symStatus(d, "settle") === "green"'
  CLI approve T-1 --stage done --by human --force > /dev/null
  CLI status --json > "$W/m1c.json"
  afile "$W/m1c.json" 'taskStatus(d, "T-1") === "done" && taskStatus(d, "T-2") === "todo" && d.tasks["T-2"].next === "/hitl:skeleton T-2"'
}
step MT1 "multitask: T-1 done on settle; T-2's modify row not started → T-2 todo (not inherited done)" sM1

sM2() {
  cd "$MT"
  mt_src "T-1, T-2" '  // 1. return the amount
  // TODO(impl): 2. add the fee
' '  return amount;'
  mt_tests todo
  CLI index > /dev/null
  CLI status T-2 --json > "$W/m2a.json"
  afile "$W/m2a.json" 'taskStatus(d, "T-2") === "skeleton" && symStatus(d, "settle") === "skeleton" && d.tasks["T-2"].next === "/hitl:approve T-2"'
  CLI status T-1 --json > "$W/m2b.json"
  afile "$W/m2b.json" 'taskStatus(d, "T-1") === "done" && symStatus(d, "settle") === "done"'
  CLI approve T-2 --stage skeleton --by human > /dev/null
  afile "$LOCK" 'd.symbols["src/settle.ts#settle"].task === "T-2" && d.symbols["src/settle.ts#settle"].tasks.join() === "T-1,T-2"'
  afile "$LOCK" 'Object.values(d.tests).filter((t) => t.task === "T-1").length === 1 && Object.values(d.tests).filter((t) => t.task === "T-2").length === 1'
  CLI status T-2 --json > "$W/m2c.json"
  afile "$W/m2c.json" 'taskStatus(d, "T-2") === "approved" && d.tasks["T-2"].workOrder.join() === "src/settle.ts#settle" && symStatus(d, "settle") === "skeleton"'
  CLI status --json > "$W/m2d.json"
  afile "$W/m2d.json" 'taskStatus(d, "T-1") === "done" && d.symbols["src/settle.ts#settle"].byTask["T-1"] === "done" && d.symbols["src/settle.ts#settle"].byTask["T-2"] === "skeleton"'
  CLI status --sync-tags > /dev/null
  grep -q '@task T-1, T-2 @impl agent @status skeleton' src/settle.ts || { echo "source @status not synced to skeleton:"; cat src/settle.ts; return 1; }
  grep -q '^1\. \[x\] `settle` | new' .hitl/tasks/feat-settle.md && grep -q '^1\. \[ \] `settle` | modify' .hitl/tasks/feat-settle.md \
    || { echo "tasks md boxes wrong:"; cat .hitl/tasks/feat-settle.md; return 1; }
}
step MT2 "multitask: T-2 skeleton on settle (TODO steps, no sentinel) → skeleton/approved, in T-2's work order; T-1 stays done; lock keeps both tasks" sM2

sM3() {
  cd "$MT"
  mt_tests red
  CLI index > /dev/null
  CLI test --task T-2 --json > "$W/m3a.json"
  afile "$W/m3a.json" 'symStatus(d, "settle") === "red"'
  CLI approve T-2 --stage tests --by human --json > "$W/m3b.json"
  afile "$W/m3b.json" 'd.ok === true'
  afile "$LOCK" 'Object.values(d.tests).filter((t) => t.task === "T-1").length === 1'
  mt_src "T-1, T-2" '  // 1. return the amount
  // 2. add the fee
' '  return amount + 1;'
  CLI index > /dev/null
  CLI test --task T-2 --json > "$W/m3c.json"
  afile "$W/m3c.json" 'symStatus(d, "settle") === "green"'
  CLI status --json > "$W/m3d.json"
  afile "$W/m3d.json" 'taskStatus(d, "T-2") === "green" && taskStatus(d, "T-1") === "done" && d.next.task === "T-2"'
  CLI drift --json > "$W/m3e.json"
  afile "$W/m3e.json" '!d.items.some((i) => ["STATUS_FORGED", "BODY_CHANGED"].includes(i.code))'
}
step MT3 "multitask: T-2 tests lock without flagging T-1's passing test as vacuous; red → green on settle; T-1 still done" sM3

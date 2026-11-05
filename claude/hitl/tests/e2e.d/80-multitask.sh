# One function, two tasks — sourced by tests/e2e.sh (interface I4).
# QT-T1 builds settle() and is done; QT-T2 later modifies it (a `modify` row: TODO(impl) steps added, working body kept, no
# sentinel). QT-T2 must route through skeleton → approved → red → green on settle while QT-T1 stays done.
MT="$W/multitask-app"

mt_src() { # mt_src <task tags> <todo lines> <body>
  printf '/**\n * Settles a charge.\n * @task %s @impl agent @status skeleton @prio 1\n */\nexport function settle(amount: number): number {\n%s%s\n}\n' "$1" "$2" "$3" > src/settle.ts
}
mt_tests() { # mt_tests <QT-T2 test: todo|red|green>
  {
    printf 'import { describe, it } from "node:test";\nimport assert from "node:assert/strict";\nimport { settle } from "../src/settle.ts";\n\ndescribe("settle", () => {\n'
    printf '  /** @covers settle @ac QT-T1.AC1 @kind example @origin test-author */\n  it("QT-T1.AC1 returns the amount", () => { assert.equal(settle(5) >= 5, true); });\n'
    case "$1" in
      todo) printf '  /** @covers settle @ac QT-T2.AC1 @kind example @origin skeleton */\n  it.todo("QT-T2.AC1 adds the fee");\n' ;;
      *) printf '  /** @covers settle @ac QT-T2.AC1 @kind example @origin test-author */\n  it("QT-T2.AC1 adds the fee", () => { assert.equal(settle(5), 6); });\n' ;;
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

## QT-T1 Settle the amount
- prio: P0 | risk: high (data) | impl: agent | blocked-by: none | status: todo
**Why**: base settle

### Acceptance criteria
- [ ] QT-T1.AC1 Given 5 When settle Then at least 5

### Symbols
1. [ ] `settle` | new | `src/settle.ts` | impl: agent | settle the amount

## QT-T2 Add the fee
- prio: P1 | risk: high (data) | impl: agent | blocked-by: QT-T1 | status: todo
**Why**: fee on top

### Acceptance criteria
- [ ] QT-T2.AC1 Given 5 When settle Then 6

### Symbols
1. [ ] `settle` | modify | `src/settle.ts` | impl: agent | add the fee
EOF
  mt_src "QT-T1" '  // TODO(impl): 1. return the amount
' '  throw new Error("TODO(impl): settle");'
  printf 'import { describe, it } from "node:test";\nimport assert from "node:assert/strict";\nimport { settle } from "../src/settle.ts";\n\ndescribe("settle", () => {\n  /** @covers settle @ac QT-T1.AC1 @kind example @origin test-author */\n  it("QT-T1.AC1 returns the amount", () => { assert.equal(settle(5) >= 5, true); });\n});\n' > tests/settle.test.ts
  CLI init --quiet
  CLI index --all --quiet
  CLI approve QT-T1 --stage skeleton --by human > /dev/null
  CLI test --task QT-T1 --json > "$W/m1a.json"
  afile "$W/m1a.json" 'symStatus(d, "settle") === "red"'
  CLI approve QT-T1 --stage tests --by human > /dev/null
  mt_src "QT-T1" '  // 1. return the amount
' '  return amount;'
  CLI index > /dev/null
  CLI test --task QT-T1 --json > "$W/m1b.json"
  afile "$W/m1b.json" 'symStatus(d, "settle") === "green"'
  CLI approve QT-T1 --stage done --by human --force > /dev/null
  CLI status --json > "$W/m1c.json"
  afile "$W/m1c.json" 'taskStatus(d, "QT-T1") === "done" && taskStatus(d, "QT-T2") === "todo" && d.tasks["QT-T2"].next === "/hitl:skeleton QT-T2"'
}
step MT1 "multitask: QT-T1 done on settle; QT-T2's modify row not started → QT-T2 todo (not inherited done)" sM1

sM2() {
  cd "$MT"
  mt_src "QT-T1, QT-T2" '  // 1. return the amount
  // TODO(impl): 2. add the fee
' '  return amount;'
  mt_tests todo
  CLI index > /dev/null
  CLI status QT-T2 --json > "$W/m2a.json"
  afile "$W/m2a.json" 'taskStatus(d, "QT-T2") === "skeleton" && symStatus(d, "settle") === "skeleton" && d.tasks["QT-T2"].next === "/hitl:approve QT-T2"'
  CLI status QT-T1 --json > "$W/m2b.json"
  afile "$W/m2b.json" 'taskStatus(d, "QT-T1") === "done" && symStatus(d, "settle") === "done"'
  CLI approve QT-T2 --stage skeleton --by human > /dev/null
  afile "$LOCK" 'd.symbols["src/settle.ts#settle"].task === "QT-T2" && d.symbols["src/settle.ts#settle"].tasks.join() === "QT-T1,QT-T2"'
  afile "$LOCK" 'Object.values(d.tests).filter((t) => t.task === "QT-T1").length === 1 && Object.values(d.tests).filter((t) => t.task === "QT-T2").length === 1'
  CLI status QT-T2 --json > "$W/m2c.json"
  afile "$W/m2c.json" 'taskStatus(d, "QT-T2") === "approved" && d.tasks["QT-T2"].workOrder.join() === "src/settle.ts#settle" && symStatus(d, "settle") === "skeleton"'
  CLI status --json > "$W/m2d.json"
  afile "$W/m2d.json" 'taskStatus(d, "QT-T1") === "done" && d.symbols["src/settle.ts#settle"].byTask["QT-T1"] === "done" && d.symbols["src/settle.ts#settle"].byTask["QT-T2"] === "skeleton"'
  CLI status --sync-tags > /dev/null
  grep -q '@task QT-T1, QT-T2 @impl agent @status skeleton' src/settle.ts || { echo "source @status not synced to skeleton:"; cat src/settle.ts; return 1; }
  grep -q '^1\. \[x\] `settle` | new' .hitl/tasks/feat-settle.md && grep -q '^1\. \[ \] `settle` | modify' .hitl/tasks/feat-settle.md \
    || { echo "tasks md boxes wrong:"; cat .hitl/tasks/feat-settle.md; return 1; }
}
step MT2 "multitask: QT-T2 skeleton on settle (TODO steps, no sentinel) → skeleton/approved, in QT-T2's work order; QT-T1 stays done; lock keeps both tasks" sM2

sM3() {
  cd "$MT"
  mt_tests red
  CLI index > /dev/null
  CLI test --task QT-T2 --json > "$W/m3a.json"
  afile "$W/m3a.json" 'symStatus(d, "settle") === "red"'
  CLI approve QT-T2 --stage tests --by human --json > "$W/m3b.json"
  afile "$W/m3b.json" 'd.ok === true'
  afile "$LOCK" 'Object.values(d.tests).filter((t) => t.task === "QT-T1").length === 1'
  mt_src "QT-T1, QT-T2" '  // 1. return the amount
  // 2. add the fee
' '  return amount + 1;'
  CLI index > /dev/null
  CLI test --task QT-T2 --json > "$W/m3c.json"
  afile "$W/m3c.json" 'symStatus(d, "settle") === "green"'
  CLI status --json > "$W/m3d.json"
  afile "$W/m3d.json" 'taskStatus(d, "QT-T2") === "green" && taskStatus(d, "QT-T1") === "done" && d.next.task === "QT-T2"'
  CLI drift --json > "$W/m3e.json"
  afile "$W/m3e.json" '!d.items.some((i) => ["STATUS_FORGED", "BODY_CHANGED"].includes(i.code))'
}
step MT3 "multitask: QT-T2 tests lock without flagging QT-T1's passing test as vacuous; red → green on settle; QT-T1 still done" sM3

# 0.16 test policy — sourced by tests/e2e.sh (interface I4). Own copy of the ts-app fixture (QT-T1, risk high (security)):
# test decisions in the tasks file, the skeleton lock (shared stub with two @ac), the tests lock (regression may pass,
# extras need @catches, duplicate names block, RED table, budget), test names without ids, `tests audit`.
TPA="$W/testpolicy-app"
TPMD=.hitl/tasks/feat-user-register.md

tp_plan() { # tp_plan <AC2 test cell>
  node -e '
    const fs = require("fs"); const f = process.argv[1];
    const s = fs.readFileSync(f, "utf8").replace(/### Test plan[\s\S]*?\n\n/, "### Test plan\n| ac | test | kind | oracle | seam | author |\n|----|------|------|--------|------|--------|\n| AC1 | new: a duplicate email in another case is saved | example | spec | UserService.createUser | test-author |\n| AC2 | " + process.argv[2] + " | — | — | — | — |\n\n");
    fs.writeFileSync(f, s);' "$TPMD" "$1"
}

sTP1() {
  cp -R "$FIX/ts-app" "$TPA"
  rm -rf "$TPA/.hitl/index"
  cd "$TPA"
  git init -q
  CLI init --quiet
  CLI index --all --quiet
  tp_plan "none: wiring only"
  expect_exit 1 CLI tasks --check --json > "$W/tp1a.json"
  contains "$W/tp1a.json" 'TEST_PLAN_NONE_RISK: QT-T1.AC2'
  tp_plan "shared: AC1"
  CLI tasks --check > /dev/null
  CLI tasks --json > "$W/tp1b.json"
  afile "$W/tp1b.json" '(() => { const t = (d.tasks || d).find((x) => x.id === "QT-T1"); return t.testPlan[0].test === "new" && t.testPlan[0].detail.startsWith("a duplicate") && t.testPlan[1].test === "shared" && t.testPlan[1].detail === "AC1"; })()'
}
step TP1 "test policy: none refused on a security task (TEST_PLAN_NONE_RISK); shared: AC1 passes tasks --check" sTP1

sTP2() {
  cd "$TPA"
  expect_exit 1 CLI approve QT-T1 --stage skeleton --by human --json > "$W/tp2a.json"
  contains "$W/tp2a.json" "QT-T1.AC2 shares the test of QT-T1.AC1: no test stub carries both @ac QT-T1.AC1 QT-T1.AC2"
  cat > tests/userService.test.ts <<'TS'
import { describe, it } from "node:test";

describe("UserService.createUser", () => {
  /**
   * @covers UserService.createUser @ac QT-T1.AC1 QT-T1.AC2 @kind example @origin skeleton
   * @catches a duplicate email in another case is saved
   */
  it.todo("rejects duplicate email ignoring case");
});
TS
  CLI index --quiet
  CLI approve QT-T1 --stage skeleton --by human --json > "$W/tp2b.json"
  afile "$W/tp2b.json" 'd.ok === true && d.changes.acCoverage["QT-T1.AC1"].length === 1 && d.changes.acCoverage["QT-T1.AC2"].join() === d.changes.acCoverage["QT-T1.AC1"].join()'
}
step TP2 "test policy: skeleton lock needs one stub carrying both @ac for shared; the test name carries no id" sTP2

sTP3() {
  cd "$TPA"
  cat > tests/userService.test.ts <<'TS'
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { UserRepo } from "../src/repo/userRepo.ts";
import { UserService } from "../src/services/userService.ts";

describe("UserService.createUser", () => {
  /**
   * @covers UserService.createUser @ac QT-T1.AC1 QT-T1.AC2 @kind example @origin test-author
   * @catches a duplicate email in another case is saved
   */
  it("rejects duplicate email ignoring case", () => {
    const repo = new UserRepo();
    repo.save({ id: "u1", email: "A@x.io", passwordHash: "h" });
    assert.throws(() => new UserService(repo).createUser("a@x.io", "h2"), /duplicate/);
  });

  /** @covers UserService.createUser @ac QT-T1.AC1 @kind example @origin test-author */
  it("rejects an empty email", () => {
    assert.throws(() => new UserService(new UserRepo()).createUser("", "h"), /email/);
  });

  /**
   * @covers UserRepo.save @ac QT-T1.AC1 @kind regression @origin test-author
   * @catches save stops keeping the users it was given
   */
  it("keeps saved users", () => {
    const repo = new UserRepo();
    repo.save({ id: "u1", email: "a@x.io", passwordHash: "h" });
    assert.equal(repo.users.length, 1);
  });

  /** @covers UserService.createUser @ac QT-T1.AC1 @kind example @origin test-author @catches empty email saved */
  it("keeps saved users", () => {
    assert.throws(() => new UserService(new UserRepo()).createUser(" ", "h"), /email/);
  });
});
TS
  CLI index --quiet
  CLI test --task QT-T1 --json > /dev/null
  expect_exit 1 CLI approve QT-T1 --stage tests --by human --json > "$W/tp3a.json"
  contains "$W/tp3a.json" "rejects an empty email: a test added after the skeleton needs @catches"
  contains "$W/tp3a.json" "duplicate test name UserService.createUser > keeps saved users"
  sed -i 's#/\*\* @covers UserService.createUser @ac QT-T1.AC1 @kind example @origin test-author \*/#/** @covers UserService.createUser @ac QT-T1.AC1 @kind example @origin test-author @catches an empty email is saved */#' tests/userService.test.ts
  node -e 'const fs=require("fs");const f="tests/userService.test.ts";let s=fs.readFileSync(f,"utf8");const i=s.lastIndexOf("it(\"keeps saved users\"");s=s.slice(0,i)+"it(\"rejects a blank email\""+s.slice(i+"it(\"keeps saved users\"".length);fs.writeFileSync(f,s)'
  CLI index --quiet
  CLI test --task QT-T1 --json > /dev/null
  CLI approve QT-T1 --stage tests --by human --json > "$W/tp3b.json"
  afile "$W/tp3b.json" 'd.ok === true && d.red.some((r) => r.name === "keeps saved users" && r.result === "passes (regression)") && d.red.filter((r) => r.result !== "passes (regression)").every((r) => ["reached-stub", "assertion-failed"].includes(r.result))'
  afile "$W/tp3b.json" 'd.budget.newRows === 1 && d.budget.limit === 3 && d.budget.tests === 4 && d.budget.over === true && d.warnings.some((w) => w.startsWith("test budget: 4 active tests > 3"))'
}
step TP3 "test policy: tests lock — extras need @catches, duplicate names block, regression passes (listed apart), budget warns" sTP3

sTP4() {
  cd "$TPA"
  CLI tests audit QT-T1 --json > "$W/tp4.json"
  afile "$W/tp4.json" 'd.schema === "hitl.tests-audit/1" && d.budget[0].task === "QT-T1" && d.budget[0].tests === 4 && !d.candidates.some((c) => c.code === "DUP_NAME")'
  CLI tests audit > "$W/tp4.txt"
  contains "$W/tp4.txt" "Tests audit"
  expect_exit 2 CLI tests prune
  CLI trace QT-T1 --json > "$W/tp4t.json"
  afile "$W/tp4t.json" 'd.rows.flatMap((r) => r.acs).find((a) => a.id === "QT-T1.AC2").test === "shared"'
}
step TP4 "test policy: tests audit (read-only, budget per task), trace shows the shared decision" sTP4

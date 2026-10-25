// P2 — JUnit ingestion: node:test, vitest, jest-junit, pytest and py_unittest_junit samples (§E.6.1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseJUnit, matchCases, decode } from "../../scripts/lib/junit.mjs";
import { buildCommand, shq } from "../../scripts/lib/runner.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, "..", "..", "scripts", "runners", "py_unittest_junit.py");
const ROOT = "/work/ts-app";
const TF = "tests/userService.test.ts", PF = "tests/test_orders.py";
const A1 = `${TF}#UserService.createUser > T-1.AC1 rejects duplicate email in any case`;
const A2 = `${TF}#UserService.createUser > T-1.AC2 returns the saved user`;
const P1 = `${PF}#TestOrders.test_T2_AC1_rejects_bad_pct`, P2 = `${PF}#TestOrders.test_T2_AC2_rounds_half_up`;
const t = (id, file, titlePath) => [id, { id, kind: "test", file, name: titlePath.join(" > "), test: { titlePath, mode: "active", coversResolved: [] } }];
const INDEX = { symbols: Object.fromEntries([
  t(A1, TF, ["UserService.createUser", "T-1.AC1 rejects duplicate email in any case"]),
  t(A2, TF, ["UserService.createUser", "T-1.AC2 returns the saved user"]),
  t(P1, PF, ["TestOrders", "test_T2_AC1_rejects_bad_pct"]),
  t(P2, PF, ["TestOrders", "test_T2_AC2_rounds_half_up"]),
]) };
const byId = (r) => Object.fromEntries(r.matched.map((m) => [m.testId, m]));

const NODE = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
	<testsuite name="UserService.createUser" time="0.001751" disabled="0" errors="0" tests="2" failures="1" skipped="0" hostname="h">
		<testcase name="T-1.AC1 rejects duplicate email in any case" time="0.000380" classname="test" file="${ROOT}/${TF}" failure="TODO(impl): UserService.createUser">
			<failure type="testCodeFailure" message="TODO(impl): UserService.createUser">
Error [ERR_TEST_FAILURE]: TODO(impl): UserService.createUser
    at new Promise (&lt;anonymous>)
			</failure>
		</testcase>
		<testcase name="T-1.AC2 returns the saved user" time="0.0004" classname="test" file="${ROOT}/${TF}"/>
	</testsuite>
	<testcase name="top level orphan" time="0.0005" classname="test" file="${ROOT}/${TF}"/>
	<!-- tests 3 -->
</testsuites>`;

const VITEST = `<?xml version="1.0" encoding="UTF-8" ?>
<testsuites name="vitest tests" tests="2" failures="1" errors="0" time="0.01">
    <testsuite name="${TF}" timestamp="2026-01-01T00:00:00" hostname="h" tests="2" failures="1" errors="0" skipped="0" time="0.01">
        <testcase classname="${TF}" name="UserService.createUser &gt; T-1.AC1 rejects duplicate email in any case" time="0.002">
            <failure message="expected [Function] to throw error matching /duplicate/" type="AssertionError">
AssertionError: expected [Function] to throw error matching /duplicate/
            </failure>
        </testcase>
        <testcase classname="${TF}" name="UserService.createUser &gt; T-1.AC2 returns the saved user" time="0.001">
            <skipped/>
        </testcase>
    </testsuite>
</testsuites>`;

const JEST = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="jest tests" tests="2" failures="1" errors="0" time="0.5">
  <testsuite name="UserService.createUser" errors="0" failures="1" skipped="0" timestamp="2026-01-01T00:00:00" time="0.4" tests="2">
    <testcase classname="UserService.createUser T-1.AC1 rejects duplicate email in any case" name="UserService.createUser T-1.AC1 rejects duplicate email in any case" time="0.003">
      <failure>Error: TODO(impl): UserService.createUser
    at Object.&lt;anonymous&gt; (src/services/userService.ts:20:11)</failure>
    </testcase>
    <testcase classname="UserService.createUser T-1.AC2 returns the saved user" name="UserService.createUser T-1.AC2 returns the saved user" time="0.001">
    </testcase>
  </testsuite>
</testsuites>`;

const PYTEST = `<?xml version="1.0" encoding="utf-8"?><testsuites><testsuite name="pytest" errors="1" failures="0" skipped="0" tests="3" time="0.05" timestamp="2026-01-01T00:00:00" hostname="h">
<testcase classname="tests.test_orders.TestOrders" name="test_T2_AC1_rejects_bad_pct" time="0.001"><failure message="NotImplementedError: TODO(impl): apply_discount">self = &lt;tests.test_orders.TestOrders testMethod=test_T2_AC1_rejects_bad_pct&gt;
E   NotImplementedError: TODO(impl): apply_discount</failure></testcase>
<testcase classname="tests.test_orders.TestOrders" name="test_T2_AC2_rounds_half_up[1]" time="0.001" />
<testcase classname="tests.test_orders.TestOrders" name="test_T2_AC2_rounds_half_up[2]" time="0.001"><error message="boom">trace</error></testcase>
</testsuite></testsuites>`;

test("decode handles entities and node's double-escaped quotes", () => {
  assert.equal(decode("a &lt;b&gt; &amp; &amp;quot;x&amp;quot; &#65;&#x42;"), 'a <b> & "x" AB');
});

test("node:test junit (nested suite, file attr, failure message)", () => {
  const cases = parseJUnit(NODE);
  assert.equal(cases.length, 3);
  assert.deepEqual(cases[0].suites, ["UserService.createUser"]);
  const r = matchCases(cases, INDEX, { root: ROOT, files: [TF] });
  const m = byId(r);
  assert.equal(m[A1].outcome, "fail");
  assert.match(m[A1].message, /TODO\(impl\): UserService\.createUser/);
  assert.equal(m[A2].outcome, "pass");
  assert.equal(r.unmatched.length, 1);
  assert.equal(r.unmatched[0].name, "top level orphan");
});

test("vitest junit (classname = file, name joined with ' > ', skipped)", () => {
  const r = matchCases(parseJUnit(VITEST), INDEX, { root: ROOT });
  const m = byId(r);
  assert.equal(m[A1].outcome, "fail");
  assert.match(m[A1].message, /duplicate/);
  assert.equal(m[A2].outcome, "skip");
  assert.deepEqual(r.unmatched, []);
});

test("jest-junit (name = titles joined by space, message from body text)", () => {
  const r = matchCases(parseJUnit(JEST), INDEX, { root: ROOT });
  const m = byId(r);
  assert.equal(m[A1].outcome, "fail");
  assert.match(m[A1].message, /TODO\(impl\)/);
  assert.equal(m[A2].outcome, "pass");
  assert.deepEqual(r.unmatched, []);
});

test("pytest junit (dotted classname → path.py + class, parametrized aggregation)", () => {
  const r = matchCases(parseJUnit(PYTEST), INDEX, { root: "/work/py-app" });
  const m = byId(r);
  assert.equal(m[P1].outcome, "fail");
  assert.match(m[P1].message, /TODO\(impl\): apply_discount/);
  assert.equal(m[P2].outcome, "error", "worst outcome of parametrized cases wins");
  assert.deepEqual(r.unmatched, []);
});

test("py_unittest_junit.py runs unittest files and its JUnit maps back", () => {
  const py = spawnSync("python3", ["--version"]);
  if (py.status !== 0) return; // python absent: skip
  const root = mkdtempSync(join(tmpdir(), "hitl-py-"));
  try {
    mkdirSync(join(root, "tests"));
    writeFileSync(join(root, "orders.py"), `def apply_discount(o, pct):\n    raise NotImplementedError("TODO(impl): apply_discount")\n\ndef round_money(x):\n    return x\n`);
    writeFileSync(join(root, PF), `import unittest\nfrom orders import apply_discount, round_money\n\nclass TestOrders(unittest.TestCase):\n    def test_T2_AC1_rejects_bad_pct(self):\n        with self.assertRaises(ValueError):\n            apply_discount(None, 200)\n\n    def test_T2_AC2_rounds_half_up(self):\n        self.assertEqual(round_money(1), 1)\n\n    @unittest.skip("later")\n    def test_skipped(self):\n        pass\n`);
    const junit = join(root, "out", "junit.xml");
    const res = spawnSync("python3", ["-I", RUNNER, "--root", root, "--junit", junit, PF], { cwd: tmpdir(), encoding: "utf8" });
    assert.equal(res.status, 1, res.stderr);
    const xml = readFileSync(junit, "utf8");
    assert.match(xml, /classname="tests\.test_orders\.TestOrders"/);
    const r = matchCases(parseJUnit(xml), INDEX, { root, files: [PF] });
    const m = byId(r);
    assert.equal(m[P1].outcome, "error");
    assert.match(m[P1].message, /TODO\(impl\): apply_discount/);
    assert.equal(m[P2].outcome, "pass");
    assert.equal(r.unmatched.length, 1, "unindexed skipped test surfaces as unmatched");
    // import error → single error case, exit 1
    writeFileSync(join(root, "tests", "test_broken.py"), "import does_not_exist\n");
    const res2 = spawnSync("python3", ["-I", RUNNER, "--root", root, "--junit", junit, "tests/test_broken.py"], { encoding: "utf8" });
    assert.equal(res2.status, 1);
    assert.match(readFileSync(junit, "utf8"), /name="&lt;import&gt;"/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("buildCommand substitutes placeholders with shell quoting", () => {
  const c = buildCommand("python3 -I ${PLUGIN}/scripts/runners/py_unittest_junit.py --root {root} --junit {junit} {files}", { junit: "/tmp/j.xml", files: ["a b.py", "it's.py"], root: "/r", plugin: "/P" });
  assert.equal(c, `python3 -I /P/scripts/runners/py_unittest_junit.py --root '/r' --junit '/tmp/j.xml' 'a b.py' ${shq("it's.py")}`);
});

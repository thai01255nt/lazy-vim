// v2 §A.1.1 — planning md grammar: requirements, decisions (by header), changelog, parse errors.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePlanningMd, readPlanning, planningRel, statusText } from "../../scripts/lib/planningmd.mjs";

const NEW = `# User Register - Planning
> status: approved | tasks: .hitl/tasks/feat-user-register.md | updated: 2026-10-25

## Goal
Register users.

## Requirements
<!-- EARS-lite -->
- R-1 [must] When a user registers, the system shall save the user.
- R-2 The system shall keep emails unique.
- R-3 [could] Where invites are enabled, the system shall send one. (status: deferred)
- R-4 [should] If x, then y. (status: dropped)
- R-5 [must] Old rule. (status: superseded by R-2)

## Decisions
| id | decision | why | cost if wrong | serves | status |
|----|----------|-----|---------------|--------|--------|
| D-1 | Check in service | single entry | dupes | R-1, R-2 | accepted |
| D-2 | Old approach | — | — | — | superseded by D-1 |
| D-3 | Rejected idea | no | none | - | rejected |

## Changelog
- 2026-10-25 D-2 superseded by D-1 (source: /hitl:sync)
`;

test("parses the new template: meta, title, requirements (prio + statuses), decisions, changelog", () => {
  const d = parsePlanningMd(NEW, ".hitl/planning/feat-user-register.md");
  assert.equal(d.title, "User Register");
  assert.deepEqual([d.status, d.tasksPath, d.updated, d.hasRequirements], ["approved", ".hitl/tasks/feat-user-register.md", "2026-10-25", true]);
  assert.deepEqual(d.requirements.map((r) => [r.id, r.priority, r.status, r.supersededBy]),
    [["R-1", "must", "active", null], ["R-2", "must", "active", null], ["R-3", "could", "deferred", null], ["R-4", "should", "dropped", null], ["R-5", "must", "superseded", "R-2"]]);
  assert.equal(d.requirements[2].text, "Where invites are enabled, the system shall send one.");
  assert.deepEqual(d.decisions[0], { id: "D-1", decision: "Check in service", why: "single entry", cost: "dupes", serves: ["R-1", "R-2"], status: "accepted", supersededBy: null });
  assert.deepEqual(d.decisions.map((x) => [x.status, x.supersededBy, x.serves]), [["accepted", null, ["R-1", "R-2"]], ["superseded", "D-1", []], ["rejected", null, []]]);
  assert.equal(statusText(d.requirements[4]), "superseded by R-2");
  assert.deepEqual(d.changelog, [{ date: "2026-10-25", text: "D-2 superseded by D-1 (source: /hitl:sync)" }]);
  assert.deepEqual(d.parseErrors, []);
});

test("legacy file: no Requirements, decisions without serves; title falls back to the stem", () => {
  const d = parsePlanningMd("> status: draft\n\n## Decisions\n| id | decision | why | cost if wrong | status |\n|---|---|---|---|---|\n| D-1 | Round half up | rule | cents | accepted |\n\n## Acceptance (feature level)\n- Given x Then y\n", "planning/feat-discount.md");
  assert.equal(d.title, "feat-discount");
  assert.equal(d.hasRequirements, false);
  assert.equal(d.status, "draft");
  assert.equal(d.tasksPath, null);
  assert.deepEqual(d.decisions[0].serves, []);
  assert.equal(d.decisions[0].status, "accepted");
  assert.deepEqual(d.parseErrors, []);
});

test("decision columns are located by header name, in any order and case", () => {
  const d = parsePlanningMd("## Decisions\n| Status | ID | Serves | Decision | Why | Cost If Wrong |\n|---|---|---|---|---|---|\n| accepted | D-4 | R-1 | Use X | fast | slow |\n", "x.md");
  assert.deepEqual(d.decisions[0], { id: "D-4", decision: "Use X", why: "fast", cost: "slow", serves: ["R-1"], status: "accepted", supersededBy: null });
});

test("malformed lines, bad statuses and duplicate ids become parseErrors (first wins)", () => {
  const d = parsePlanningMd(`## Requirements
- R-1 [must] ok.
- R-x broken
- R-2
- R-1 [must] dup.
- not a requirement line is ignored

## Decisions
| id | decision | why | cost if wrong | serves | status |
|---|---|---|---|---|---|
| D-1 | a | b | c | R-1 | approved |
| D-1 | dup | b | c | R-1 | accepted |

## Changelog
- yesterday something
- 2026-01-01 fine
`, "x.md");
  const by = (s) => d.parseErrors.filter((e) => e.section === s).map((e) => e.line);
  assert.equal(by("requirements").length, 3);
  assert.ok(by("requirements").includes("- R-1 [must] dup."));
  assert.equal(d.requirements.length, 1);
  assert.equal(d.requirements[0].text, "ok.");
  assert.equal(d.decisions.length, 1, "duplicate D row dropped");
  assert.equal(d.decisions[0].status, "approved", "invalid status kept raw");
  assert.equal(by("decisions").length, 2);
  assert.deepEqual(by("changelog"), ["- yesterday something"]);
  assert.equal(d.changelog.length, 1);
});

test("readPlanning resolves tasks-md paths and bare names; missing → null", async () => {
  const root = mkdtempSync(join(tmpdir(), "hitl-plan-"));
  mkdirSync(join(root, ".hitl/planning"), { recursive: true });
  writeFileSync(join(root, ".hitl/planning/feat-a.md"), NEW);
  for (const rel of [".hitl/planning/feat-a.md", "feat-a.md", "feat-a"]) {
    const d = await readPlanning(root, rel);
    assert.equal(d.file, ".hitl/planning/feat-a.md");
    assert.equal(d.requirements.length, 5);
  }
  assert.equal(await readPlanning(root, "nope"), null);
  assert.equal(await readPlanning(root, "none"), null);
  assert.equal(planningRel("x"), ".hitl/planning/x.md");
});

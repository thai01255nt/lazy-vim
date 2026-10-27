// /hitl:plan stop rule (shared/interview.md §9): spec validate reports open clarifications on SHALL/MUST requirements
// (REQ_UNCLEAR) and coverage categories that are not clear (COVERAGE_GAP); "💡 Forced:" in Open questions downgrades them.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate, resetStatusCache } from "../../scripts/lib/changes.mjs";
import { parseProposal } from "../../scripts/lib/specmd.mjs";

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/spec-app");
const ID = "feat-deactivate";
const DIR = `.hitl/changes/${ID}`;
function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-stop-"));
  fs.cpSync(FIX, root, { recursive: true });
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  resetStatusCache();
  return root;
}
const proposal = ({ status = "draft", coverage = "", open = "" } = {}) =>
  `# Deactivate\n> change: ${ID} | status: ${status} | created: 2026-10-27 | updated: 2026-10-27\n\n## Why\nAdmins need it.\n\n` +
  `## What changes\n- Admins can deactivate a user.\n\n## Capabilities\n| capability | key | change | requirements |\n|---|---|---|---|\n` +
  `| accounts | ACC | modified | +ACC-R7 |\n\n${coverage}## Artifacts\n| artifact | decision | why |\n|---|---|---|\n| design | skipped | small |\n\n` +
  `## Open questions\n${open}`;
const delta = (statement) => `# Delta: Accounts\n> capability: accounts | key: ACC | change: ${ID}\n\n## ADDED Requirements\n` +
  `### Requirement: ACC-R7 Deactivate a user\n${statement}\n\n#### Scenario: ACC-R7.S1 Deactivated user cannot sign in\n` +
  `- GIVEN a deactivated user\n- WHEN they sign in\n- THEN sign-in is refused\n`;
const COV = (rows) => `## Coverage\n| category | status | note |\n|---|---|---|\n${rows}\n\n`;
const items = async (root) => (await validate(root, {}, { change: ID, record: false })).items.filter((i) => ["REQ_UNCLEAR", "COVERAGE_GAP"].includes(i.code));

test("parseProposal reads ## Coverage and 💡 Forced lines", () => {
  const p = parseProposal(proposal({ coverage: COV("| Scope & behaviour | ✅ | |\n| Data & lifecycle | ⚠️ | states? |\n| NFR | — | none asked by the user |\n| Terminology | ❌ | |"),
    open: "- [ ] Q4 who may reactivate? — 💡 recommended: admins\n- 💡 Forced: closed with data gaps (user, 2026-10-27)\n" }), "p.md");
  assert.deepEqual(p.coverage.map((c) => [c.category, c.status]), [["Scope & behaviour", "clear"], ["Data & lifecycle", "partial"], ["NFR", "n/a"], ["Terminology", "missing"]]);
  assert.equal(p.forced.length, 1);
  assert.equal(parseProposal(proposal(), "p.md").coverage, null);
});

test("draft: SHALL with [NEEDS CLARIFICATION] → REQ_UNCLEAR warn; SHOULD is not checked", async () => {
  let root = project({ [`${DIR}/proposal.md`]: proposal(), [`${DIR}/specs/accounts/spec.md`]: delta("When an admin deactivates a user, the system SHALL [NEEDS CLARIFICATION: end open sessions?].") });
  assert.deepEqual((await items(root)).map((i) => [i.level, i.code, i.ref]), [["warn", "REQ_UNCLEAR", "ACC-R7"]]);
  root = project({ [`${DIR}/proposal.md`]: proposal(), [`${DIR}/specs/accounts/spec.md`]: delta("The system SHOULD notify the user [NEEDS CLARIFICATION: by email?].") });
  assert.deepEqual(await items(root), []);
});

test("coverage gaps: ⚠️ ❌, unmarked, and — without a reason are gaps; ✅ and — with a reason are not", async () => {
  const root = project({ [`${DIR}/proposal.md`]: proposal({ coverage: COV("| Scope & behaviour | ✅ | |\n| Data & lifecycle | ⚠️ | |\n| Edge cases & errors | ❌ | |\n| NFR | — | |\n| Terminology | — | no new terms |\n| Success criteria | ? | |") }),
    [`${DIR}/specs/accounts/spec.md`]: delta("When an admin deactivates a user, the system SHALL refuse their sign-in.") });
  assert.deepEqual((await items(root)).map((i) => [i.level, i.ref]), [["warn", "Data & lifecycle"], ["warn", "Edge cases & errors"], ["warn", "NFR"], ["warn", "Success criteria"]]);
});

test("approved: gaps are errors unless forced (then REQ_UNCLEAR warn, COVERAGE_GAP info)", async () => {
  const d = delta("When an admin deactivates a user, the system SHALL [NEEDS CLARIFICATION: end open sessions?].");
  let root = project({ [`${DIR}/proposal.md`]: proposal({ status: "approved", coverage: COV("| Edge cases & errors | ❌ | |") }), [`${DIR}/specs/accounts/spec.md`]: d });
  assert.deepEqual((await items(root)).map((i) => [i.level, i.code]).sort(), [["error", "COVERAGE_GAP"], ["error", "REQ_UNCLEAR"]]);
  root = project({ [`${DIR}/proposal.md`]: proposal({ status: "approved", coverage: COV("| Edge cases & errors | ❌ | |"), open: "- 💡 Forced: approved with gaps (user)\n" }), [`${DIR}/specs/accounts/spec.md`]: d });
  assert.deepEqual((await items(root)).map((i) => [i.level, i.code]).sort(), [["info", "COVERAGE_GAP"], ["warn", "REQ_UNCLEAR"]]);
  const res = await validate(root, {}, { change: ID, record: false });
  assert.deepEqual(res.items.filter((i) => i.code === "NEEDS_CLARIFICATION").map((i) => i.level), ["warn"], "forced keeps the marker a warning");
});

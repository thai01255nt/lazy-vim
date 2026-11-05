import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeProject } from "./_project.mjs";
import { updateIndex, buildContext, readIndex } from "../../scripts/lib/api.mjs";
import { writeMapMd } from "../../scripts/lib/mapmd.mjs";
import { effectiveTerms, termsFor } from "../../scripts/lib/context.mjs";
import { parseGlossary } from "../../scripts/lib/specmd.mjs";

test("context for a task lists ACs, targets, callers, callees and tests without line numbers", async () => {
  const root = makeProject();
  await updateIndex(root, null, { full: true });
  const c = await buildContext(root, "QT-T1", {});
  assert.match(c.markdown, /^# Context QT-T1 — Register user/);
  assert.match(c.markdown, /- QT-T1.AC1 Given an existing email/);
  assert.match(c.markdown, /### 1\. UserService\.createUser — impl: agent/);
  assert.match(c.markdown, /callers \(1\): register \(src\/http\/authController\.ts\) — "Handles registration requests\."/);
  assert.match(c.markdown, /callees declared \(@calls\): UserRepo\.findByEmail: findByEmail\(email: string\): User \| undefined/);
  assert.match(c.markdown, /throw new Error\("TODO\(impl\): UserService.createUser"\)/);
  assert.match(c.markdown, /interface User \{ id: string; email: string \}/);
  assert.doesNotMatch(c.markdown, /\.ts:\d+/);
  assert.deepEqual(c.symbols, ["src/services/userService.ts#UserService.createUser", "src/repo/userRepo.ts#UserRepo.findByEmail"]);
  assert.deepEqual(c.callers, ["src/http/authController.ts#register"]);
});

test("contract mode hides bodies, keeps TODO lines, adds test files and import paths", async () => {
  const root = makeProject();
  await updateIndex(root, null, { full: true });
  const c = await buildContext(root, "UserService.createUser", { contract: true });
  assert.doesNotMatch(c.markdown, /throw new Error/);
  assert.match(c.markdown, /\/\/ TODO\(impl\): 1\. reject duplicates\n\s+…\n\s+\}/);
  assert.match(c.markdown, /import paths: src\/services\/userService\.ts → \.\.\/src\/services\/userService\.ts/);
  assert.match(c.markdown, /it\.todo\("QT-T1\.AC1 rejects duplicate email"\)/);
  const small = await buildContext(root, "QT-T1", { contract: true, budget: 900 });
  assert.ok(small.markdown.length <= 900);
  await assert.rejects(buildContext(root, "Nope.none", {}), /unknown ref/);
});

test("map-md writes the AUTO block and preserves manual text", async () => {
  const root = makeProject({ ".hitl/docs/CODEBASE-MAP.md": "# Map\nmanual note\n<!-- AUTO-GENERATED:BEGIN codebase-map -->\nold\n<!-- AUTO-GENERATED:END codebase-map -->\ntail\n" });
  await updateIndex(root, null, { full: true });
  await writeMapMd(root, await readIndex(root));
  const md = readFileSync(join(root, ".hitl/docs/CODEBASE-MAP.md"), "utf8");
  assert.match(md, /^# Map\nmanual note\n<!-- AUTO-GENERATED:BEGIN codebase-map -->\n## src\/http\//);
  assert.match(md, /createUser\(email: string\): User` \(exported\) \[QT-T1 · agent · skeleton\] — Registers a user\./);
  assert.match(md, /<!-- AUTO-GENERATED:END codebase-map -->\ntail\n$/);
  assert.match(readFileSync(join(root, ".hitl/index/index.md"), "utf8"), /\| src\/repo\/userRepo.ts#UserRepo.findByEmail \| method \| QT-T1 \| manual/);
});

test("AC lines carry requirement text; decisions only outside contract mode", async () => {
  const { write } = await import("./_project.mjs");
  const root = makeProject({ ".hitl/planning/feat-users.md": "# U - Planning\n> status: approved\n\n## Requirements\n- R-1 [must] The system shall reject duplicate emails.\n\n## Decisions\n| id | decision | why | cost if wrong | serves | status |\n|---|---|---|---|---|---|\n| D-1 | Check in createUser | x | y | R-1 | accepted |\n" });
  const tf = join(root, ".hitl/tasks/feat-users.md");
  write(root, ".hitl/tasks/feat-users.md", readFileSync(tf, "utf8").replace("QT-T1.AC1 Given", "QT-T1.AC1 (R-1) Given").replace("### Acceptance", "**Why**: one entry point (D-1)\n\n### Acceptance"));
  const svc = join(root, "src/services/userService.ts");
  write(root, "src/services/userService.ts", readFileSync(svc, "utf8").replace("@prio 1", "@prio 1\n   * @dec D-1"));
  await updateIndex(root, null, { full: true });
  const c = await buildContext(root, "QT-T1", {});
  assert.match(c.markdown, /- QT-T1\.AC1 \(R-1: The system shall reject duplicate emails\.\) Given an existing email/);
  assert.match(c.markdown, /## Decisions\n- D-1 \(accepted\): Check in createUser/);
  assert.match(c.markdown, /decisions \(@dec\): D-1 \(Check in createUser\)/);
  const k = await buildContext(root, "QT-T1", { contract: true });
  assert.match(k.markdown, /- QT-T1\.AC1 \(R-1: The system shall reject duplicate emails\.\)/);
  assert.doesNotMatch(k.markdown, /## Decisions/);
  assert.doesNotMatch(k.markdown, /decisions \(@dec\)/);
});

test("contract mode: collaborator contracts = @calls callees + symbols named in the intent (in scope only); dropped before test bodies", async () => {
  const { write } = await import("./_project.mjs");
  const root = makeProject({ "src/other/settle.ts": "/** Settles once. */\nexport function settleOnce() { return 1; }\n" });
  const svc = join(root, "src/services/userService.ts");
  write(root, "src/services/userService.ts", readFileSync(svc, "utf8").replace("Registers a user.", "Registers a `User`; already settled → settleOnce; save is the repo's."));
  await updateIndex(root, null, { full: true });
  const c = await buildContext(root, "UserService.createUser", { contract: true });
  const sec = c.markdown.split("\n## Collaborator contracts\n")[1]?.split("\n## ")[0] ?? "";
  assert.match(sec, /### User — type — src\/repo\/userRepo\.ts\n(signature: .*\n)?A user\./, "named in prose, file imported");
  assert.match(sec, /### UserRepo\.findByEmail — method — src\/repo\/userRepo\.ts\nsignature: findByEmail\(email: string\): User \| undefined\nFinds a user by email\./, "declared callee, full intent");
  assert.doesNotMatch(sec, /settleOnce/, "file neither a target file nor imported");
  assert.doesNotMatch(sec, /UserRepo\.save/, "no intent to show");
  assert.doesNotMatch((await buildContext(root, "UserService.createUser", {})).markdown, /Collaborator contracts/, "contract mode only");
  const full = c.markdown.length;
  let b = full;
  while (b > 200 && (await buildContext(root, "UserService.createUser", { contract: true, budget: b })).markdown.includes("Collaborator contracts")) b -= 10;
  const at = (await buildContext(root, "UserService.createUser", { contract: true, budget: b })).markdown;
  assert.match(at, /#### tests\/userService\.test\.ts/, "test bodies survive the collab drop");
  assert.doesNotMatch(at, /siblings:/, "siblings dropped first");
});

// ## Terms (shared language): the glossary words a task uses travel in the context and the contract pack.
const SPEC_APP = fileURLToPath(new URL("../fixtures/spec-app", import.meta.url));
const copySpecApp = () => { const d = mkdtempSync(join(tmpdir(), "hitl-ctx-terms-")); cpSync(SPEC_APP, d, { recursive: true }); return d; };

test("Terms: glossary terms (living + the change's delta) named in the title, ACs or linked scenarios", async () => {
  const root = copySpecApp();
  const c = await buildContext(root, "PWR-T1", { contract: true });
  assert.match(c.markdown, /\n## Terms\n- \*\*Account\*\*: A registered person's identity in the shop, reached by their email address\. \(avoid: user record, profile\)\n- \*\*Reset link\*\*: A single-use link that lets a user set a new password\. \(avoid: token, magic link\)\n/);
  assert.ok(c.markdown.indexOf("## Terms") > c.markdown.indexOf("## Acceptance criteria"), "after the ACs");
  assert.deepEqual(c.terms.map((t) => t.term), ["Account", "Reset link"]);
  const t13 = await buildContext(root, "PWR-T2", {});
  assert.deepEqual(t13.terms, [{ term: "Reset link", text: "A single-use link that lets a user set a new password.", avoid: ["token", "magic link"] }]);
  assert.match(t13.markdown, /## Terms\n- \*\*Reset link\*\*/, "outside contract mode too");
});

test("Terms: no glossary or no match → no section and terms: []", async () => {
  const root = makeProject();
  await updateIndex(root, null, { full: true });
  const c = await buildContext(root, "QT-T1", { contract: true });
  assert.doesNotMatch(c.markdown, /## Terms/);
  assert.deepEqual(c.terms, []);
  assert.deepEqual((await buildContext(root, "UserService.createUser", {})).terms, []);
});

test("Terms: delta overrides living, avoided words match, whole words only (Unicode), cap 8", () => {
  const living = parseGlossary("# Glossary\n> updated: 2026-10-20\n\n### Term: Account\nA person's identity.\n_Avoid_: user record\n\n### Term: Order\nA purchase.\n\n### Term: Hoàn tiền\nTiền trả lại cho khách.\n_Avoid_: trả tiền\n", "GLOSSARY.md");
  const delta = parseGlossary("# Glossary delta\n> change: x\n\n## MODIFIED Terms\n### Term: Account\nA person's identity, by email.\n_Avoid_: user record, profile\n\n## REMOVED Terms\n### Term: Order\nReason: gone\n", "glossary.md", { delta: true });
  const terms = effectiveTerms(living, delta);
  assert.deepEqual(terms.map((t) => [t.term, t.text, t.avoid]), [["Account", "A person's identity, by email.", ["user record", "profile"]], ["Hoàn tiền", "Tiền trả lại cho khách.", ["trả tiền"]]]);
  assert.deepEqual(termsFor(terms, "Merge two USER  RECORD rows").map((t) => t.term), ["Account"], "avoided word, case and spaces folded");
  assert.deepEqual(termsFor(terms, "Accounts page; khách được hoàn tiền").map((t) => t.term), ["Hoàn tiền"], "no partial word; diacritics");
  assert.deepEqual(termsFor(terms, "Hoàn tiềnx"), [], "Unicode word boundary");
  const many = Array.from({ length: 10 }, (_, i) => ({ term: `T${i}`, text: "x", avoid: [] }));
  assert.equal(termsFor(many, many.map((t) => t.term).join(" ")).length, 8);
});

# Id jump (0.19): `hitl-index where <id>` — sourced by tests/e2e.sh (interface I4).
# On a copy of spec-app with a source file (a task symbol tagged `@task PWR-T1`), a test whose `@ac` holds two AC ids
# and a plan brief with a `→ recorded:` mark: the quickfix lines (`file:line:col: role: text`, def first, archive hits
# marked), the --json shape an editor reads, exact id boundaries (PWR-R1 is not PWR-R1.S2), lower-case input, exit 1
# for an id with no location and exit 2 for a string that is not an id.
WH="$W/where-app"

sWH1() {
  cp -R "$FIX/spec-app" "$WH"
  cd "$WH"
  git init -q
  mkdir -p src tests
  printf '/** Issues reset links. */\nexport class ResetService {\n  /**\n   * Sends a single-use reset link.\n   * @task PWR-T1 @impl agent @status done\n   */\n  sendLink(email: string): void {}\n}\n' > src/reset.ts
  printf 'import { it } from "node:test";\n/** @covers ResetService.sendLink @ac PWR-T1.AC1,PWR-T1.AC2 @kind example @origin test-author */\nit("unknown email reveals nothing", () => {});\n' > tests/reset.test.ts
  printf '# Plan brief — feat-password-reset\n> change: feat-password-reset | key: PWR | kind: plan | status: open | round: 1 | updated: 2026-11-20\n\n## Round 1\n\n### Q1 [R] Who may reset a password?\n> anyone\n→ recorded: PWR-R1, PWR-R1.S2\n' > .hitl/changes/feat-password-reset/plan-brief.md
  CLI index --json > /dev/null
  CLI where pwr-t1.ac2 > "$W/wh1.txt"
  contains "$W/wh1.txt" ".hitl/changes/feat-password-reset/tasks.md:11:7: def: - [x] PWR-T1.AC2"
  contains "$W/wh1.txt" "tests/reset.test.ts:2:50: test: /** @covers ResetService.sendLink @ac PWR-T1.AC1,PWR-T1.AC2"
  head -1 "$W/wh1.txt" | grep -q ": def: " || { echo "def is not first"; cat "$W/wh1.txt"; return 1; }
  CLI where PWR-T1 --json > "$W/wh1.json"
  afile "$W/wh1.json" 'd.schema === "hitl.where/1" && d.id === "PWR-T1" && d.kind === "task" && d.locations[0].role === "def" && d.locations[0].line === 5'
  afile "$W/wh1.json" 'd.locations.some((l) => l.role === "symbol" && l.file === "src/reset.ts" && l.line === 7 && l.symbol === "src/reset.ts#ResetService.sendLink")'
  afile "$W/wh1.json" '!d.locations.some((l) => l.file === "tests/reset.test.ts")'
}
step WH1 "where: AC def first then the test whose @ac holds it (quickfix lines, lower-case input); task def + its symbol (--json)" sWH1

sWH2() {
  cd "$WH"
  CLI where PWR-R1 --json > "$W/wh2.json"
  afile "$W/wh2.json" 'd.kind === "requirement" && d.locations[0].role === "def" && d.locations.every((l) => !/PWR-R1\.S/.test(l.text) || /PWR-R1(?![.\d])/.test(l.text))'
  afile "$W/wh2.json" 'd.locations.some((l) => l.role === "brief" && l.file.endsWith("plan-brief.md") && l.line === 8)'
  CLI where TFA-R1 > "$W/wh2.txt"
  contains "$W/wh2.txt" ".hitl/archive/2026-10-20-feat-2fa/specs/accounts/spec.md:6:18: def (archived): ### Requirement: TFA-R1 Two-factor code"
  expect_exit 1 CLI where PWR-R99 2> "$W/wh2.err"
  contains "$W/wh2.err" "PWR-R99 not found"
  expect_exit 2 CLI where PWR-X1 2> "$W/wh2.err"
  contains "$W/wh2.err" "is not a hitl id"
}
step WH2 "where: requirement boundaries, the brief's recorded mark, archive hits marked; exit 1 unknown id, exit 2 not an id" sWH2

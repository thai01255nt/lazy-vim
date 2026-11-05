# 0.13 upgrade — `hitl-index migrate --ids` (the /hitl:migrate skill's CLI) on a 0.12 project built with the 0.12 CLI
# (tests/fixtures/legacy-ids: T-n tasks, D-n decisions, capability-keyed spec ids, hitl.lock/1 with approved skeletons,
# a note, a review, a Linear map) — sourced by tests/e2e.sh (interface I4).
MI="$W/legacy-ids"
MI_KEYS="feat-2fa=TFA,feat-password-reset=PWR,cap:accounts=LACC"

sMI1() {
  cp -R "$FIX/legacy-ids" "$MI"
  cd "$MI"
  git init -q && git add -A && git -c user.email=e2e@x -c user.name=e2e commit -qm "hitl 0.12 project"
  CLI index --all --quiet
  CLI drift --json | aj 'd.summary.block === 0 && d.summary.warn === 0'
  hook session-start "$(P="$PWD" js '{session_id:"mi1",cwd:process.env.P,hook_event_name:"SessionStart"}')" "$W/mi1.out"
  contains "$W/mi1.out" "pre-0.13 ids"
  contains "$W/mi1.out" "run /hitl:migrate"
  CLI status --json | aj 'd.next.command === "/hitl:migrate" && d.idsLegacy.code === "IDS_LEGACY"'
  expect_exit 1 CLI approve T-12 --stage tests 2> "$W/mi1b.err"
  contains "$W/mi1b.err" "T-12 is a pre-0.13 task id: run /hitl:migrate"
}
step MI1 "0.12 project: session-start and status route to /hitl:migrate; approve of a T-n refuses with the hint (no crash)" sMI1

sMI2() {
  cd "$MI"
  CLI migrate --ids --dry-run --json > "$W/mi2a.json"
  afile "$W/mi2a.json" 'd.status === "plan" && d.keys.length === 2 && d.legacyKeys[0].key === "LACC" && d.files.code.length === 4 && d.lock.tasks === 4'
  [ -z "$(git status --porcelain)" ] || { echo "dry run changed files"; git status --porcelain; return 1; }
  echo "// wip" >> src/reset.ts
  expect_exit 1 CLI migrate --ids --keys "$MI_KEYS"
  grep -q "^## T-12 " .hitl/changes/feat-password-reset/tasks.md || { echo "a refused run wrote"; return 1; }
  git checkout -q -- src/reset.ts
  CLI migrate --ids --keys "$MI_KEYS" --json > "$W/mi2b.json"
  afile "$W/mi2b.json" 'd.status === "applied" && d.map.tasks["T-12"] === "PWR-T1" && d.map.specs["ACC-R5"] === "PWR-R1" && d.map.specs["ACC-R1"] === "LACC-R1" && d.idMap === ".hitl/index/id-map.json"'
  CLI migrate --ids --json | aj 'd.status === "current"'
  git add -A && git -c user.email=e2e@x -c user.name=e2e commit -qm "chore(hitl): migrate to 0.13 ids"
  CLI migrate --ids --json | aj 'd.status === "current"'
  [ -z "$(git status --porcelain)" ] || { echo "second run changed files"; git status --porcelain; return 1; }
  git ls-files --error-unmatch .hitl/index/id-map.json > /dev/null || { echo "id map not committed"; return 1; }
}
step MI2 "migrate --ids: dry run writes nothing; dirty source refused; apply with the key table; second run is a no-op; id map committed" sMI2

sMI3() {
  cd "$MI"
  CLI spec validate --json | aj 'd.ok && d.counts.error === 0 && d.counts.warn === 0'
  CLI tasks --check --quiet
  CLI trace --check --json > "$W/mi3a.json"
  afile "$W/mi3a.json" 'd.counts.block === 0 && d.rows.some((r) => r.req && r.req.id === "PWR-R1" && r.scenarios.some((s) => s.acs.some((a) => a.id === "PWR-T1.AC1")))'
  CLI drift --fail-on block --json > "$W/mi3b.json"
  afile "$W/mi3b.json" 'd.summary.block === 0 && d.summary.warn === 0'
  CLI status --json > "$W/mi3c.json"
  afile "$W/mi3c.json" '!d.idsLegacy && taskStatus(d, "PWR-T1") === "approved" && taskStatus(d, "QT-T1") === "approved" && taskStatus(d, "TFA-T1") === "done" && d.drift.block === 0 && d.next.command !== "/hitl:migrate"'
  hook session-start "$(P="$PWD" js '{session_id:"mi3",cwd:process.env.P,hook_event_name:"SessionStart"}')" "$W/mi3.out"
  ! grep -q "pre-0.13" "$W/mi3.out" || { echo "legacy notice after migration"; cat "$W/mi3.out"; return 1; }
  contains src/reset.ts "@task PWR-T1 @impl agent"
  contains src/labels.py "# TODO(impl QT-T1): 1. replace the misspelt word"
  [ -f .hitl/reviews/PWR-T1/decisions.json ] && [ ! -e .hitl/reviews/T-12 ] || { echo "review dir not moved"; return 1; }
  CLI context T-12 > "$W/mi3d.out" 2> "$W/mi3d.err"
  contains "$W/mi3d.out" "# Context PWR-T1 — Send a reset link"
  contains "$W/mi3d.err" "T-12 is now PWR-T1"
  [ "$(CLI next-id feat-password-reset)" = "PWR-T3" ] || { echo "next-id"; return 1; }
  CLI approve PWR-T2 --stage tests --by human --dry-run --json > "$W/mi3e.json" || true
  ! grep -q "pre-0.13" "$W/mi3e.json" || { echo "approve still sees legacy ids"; return 1; }
}
step MI3 "after migrate --ids: validate (0 warnings), tasks, trace --check, drift and status clean; tags, reviews, old-id lookup, next-id" sMI3

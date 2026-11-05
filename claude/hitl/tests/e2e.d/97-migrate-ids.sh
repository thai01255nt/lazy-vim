# 0.13 upgrade — `hitl-index migrate --ids` (the /hitl:migrate skill's CLI) on a 0.12 project built with the 0.12 CLI
# (tests/fixtures/legacy-ids: T-n tasks, D-n decisions, capability-keyed spec ids, hitl.lock/1 with approved skeletons,
# a note, a review, a Linear map) — sourced by tests/e2e.sh (interface I4). The quick file (T-20) gets its own key
# (0.13.2, deterministic: Q + slug letters + hash letters); MI4 replays a 0.13.1 project whose quick task is QT-T1.
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
  DK=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).quickKeys[0].key)' "$W/mi2a.json")
  afile "$W/mi2b.json" "d.quickKeys.length === 1 && /^QF[A-Z]{3}\$/.test(d.quickKeys[0].key) && d.quickKeys[0].key === \"$DK\" && d.map.tasks[\"T-20\"] === \"$DK-T1\""
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
  QK=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(".hitl/index/id-map.json", "utf8")).quickKeys[".hitl/tasks/fix-label-typo.md"])')
  afile "$W/mi3c.json" "!d.idsLegacy && taskStatus(d, \"PWR-T1\") === \"approved\" && taskStatus(d, \"$QK-T1\") === \"approved\" && taskStatus(d, \"TFA-T1\") === \"done\" && d.drift.block === 0 && d.next.command !== \"/hitl:migrate\""
  hook session-start "$(P="$PWD" js '{session_id:"mi3",cwd:process.env.P,hook_event_name:"SessionStart"}')" "$W/mi3.out"
  ! grep -q "pre-0.13" "$W/mi3.out" || { echo "legacy notice after migration"; cat "$W/mi3.out"; return 1; }
  contains src/reset.ts "@task PWR-T1 @impl agent"
  contains src/labels.py "# TODO(impl $QK-T1): 1. replace the misspelt word"
  contains .hitl/tasks/fix-label-typo.md "← Change: none | key: $QK"
  [ -f .hitl/reviews/PWR-T1/decisions.json ] && [ ! -e .hitl/reviews/T-12 ] || { echo "review dir not moved"; return 1; }
  CLI context T-12 > "$W/mi3d.out" 2> "$W/mi3d.err"
  contains "$W/mi3d.out" "# Context PWR-T1 — Send a reset link"
  contains "$W/mi3d.err" "T-12 is now PWR-T1"
  [ "$(CLI next-id feat-password-reset)" = "PWR-T3" ] || { echo "next-id"; return 1; }
  CLI approve PWR-T2 --stage tests --by human --dry-run --json > "$W/mi3e.json" || true
  ! grep -q "pre-0.13" "$W/mi3e.json" || { echo "approve still sees legacy ids"; return 1; }
}
step MI3 "after migrate --ids: validate (0 warnings), tasks, trace --check, drift and status clean; tags, reviews, old-id lookup, next-id" sMI3

sMI4() {
  cd "$MI"
  # replay 0.13.1: the quick task under the shared key QT (header without a key), approved in the lock, with a review dir
  QK=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(".hitl/index/id-map.json", "utf8")).quickKeys[".hitl/tasks/fix-label-typo.md"])')
  for f in $(grep -rlF "$QK" .hitl src tests); do sed -i.bak -e "s/ | key: $QK//" -e "s/$QK-T/QT-T/g" "$f" && rm -f "$f.bak"; done
  node -e 'const f=".hitl/index/id-map.json",fs=require("fs"),m=JSON.parse(fs.readFileSync(f,"utf8"));delete m.quickKeys;m.ids["T-20"]="QT-T1";fs.writeFileSync(f,JSON.stringify(m,null,2)+"\n")'
  mkdir -p .hitl/reviews/QT-T1 && echo '{"task":"QT-T1"}' > .hitl/reviews/QT-T1/decisions.json
  git add -A && git -c user.email=e2e@x -c user.name=e2e commit -qm "hitl 0.13.1 quick task QT-T1"
  CLI index --all --quiet
  CLI status --json | aj 'd.next.command === "/hitl:migrate" && d.idsLegacy.code === "IDS_LEGACY" && /legacy QT-T<n> quick-task ids/.test(d.idsLegacy.reasons[0])'
  CLI status --brief > "$W/mi4a.out"
  contains "$W/mi4a.out" "legacy quick-task ids"
  expect_exit 1 CLI tasks --check > "$W/mi4b.out" 2>&1
  contains "$W/mi4b.out" "IDS_LEGACY: QT-T1 uses the legacy shared quick key QT"
  CLI migrate --ids --dry-run --json > "$W/mi4c.json"
  afile "$W/mi4c.json" 'd.status === "plan" && d.keys.every((k) => k.source === "proposal") && d.quickKeys.length === 1 && Object.keys(d.map.tasks).join() === "QT-T1" && d.map.tasks["QT-T1"] === d.quickKeys[0].key + "-T1" && d.files.renamed.some((r) => r.from === ".hitl/reviews/QT-T1")'
  [ -z "$(git status --porcelain)" ] || { echo "dry run changed files"; git status --porcelain; return 1; }
  NK=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).quickKeys[0].key)' "$W/mi4c.json")
  CLI migrate --ids --keys "quick:fix-label-typo=$NK" --json > "$W/mi4d.json"
  afile "$W/mi4d.json" 'd.status === "applied"'
  contains .hitl/tasks/fix-label-typo.md "← Change: none | key: $NK"
  contains .hitl/tasks/fix-label-typo.md "## $NK-T1 Fix the label typo"
  contains src/labels.py "# TODO(impl $NK-T1): 1. replace the misspelt word"
  afile "$LOCK" "!!d.tasks[\"$NK-T1\"] && !d.tasks[\"QT-T1\"]"
  [ -f ".hitl/reviews/$NK-T1/decisions.json" ] && [ ! -e .hitl/reviews/QT-T1 ] || { echo "review dir not moved"; return 1; }
  afile .hitl/index/id-map.json "d.ids[\"QT-T1\"] === \"$NK-T1\" && d.ids[\"T-20\"] === \"$NK-T1\""
  CLI tasks --check --quiet
  CLI status --json | aj '!d.idsLegacy && d.next.command !== "/hitl:migrate"'
  CLI drift --fail-on block --json | aj 'd.summary.block === 0'
  CLI migrate --ids --json | aj 'd.status === "current"'
  CLI context QT-T1 2> "$W/mi4e.err" > /dev/null
  contains "$W/mi4e.err" "QT-T1 is now $NK-T1"
  # a new quick task never gets QT: its own key, free of every key in the registry
  NQ=$(CLI next-id --quick fix-greeting)
  case "$NQ" in QF???-T1) ;; *) echo "next-id --quick gave $NQ"; return 1;; esac
}
step MI4 "0.13.1 QT quick task: status/tasks --check report IDS_LEGACY; migrate --ids gives the file its own key (header, tags, lock, review dir, id map); next-id --quick never QT" sMI4

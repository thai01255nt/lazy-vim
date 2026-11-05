#!/usr/bin/env bash
# Build a throw-away project for one eval scenario.
# Usage: evals/fixtures/build.sh <kind> <dest>
#   kind: spec      ts-app code + spec-app .hitl (approved change feat-password-reset with design + tasks) + docs
#         plan      = spec (a new feature is planned on top)
#         design    = spec, minus design.md/tasks.md of feat-password-reset (proposal approved)
#         tasks     = spec, minus tasks.md (spec + design approved)
#         flow      = design (next step should be /hitl:design feat-password-reset)
#         review    ts-app (v0.5 tasks file) driven to "QT-T1 implemented, tests green, skeleton+tests locked"
#         lua       lua-app (pure Lua + LuaLS annotations, busted) with approved change feat-burst-credit, BURST-T1 todo
#         churn     churn-app (node:test) with approved change feat-fee: FEE-T1 settle done (2 locked tests), FEE-T2 todo
#         churn-noted   = churn + open note N-1 "the fee is 2, not 1" (refs FEE-R1.S2; touches FEE-T1)
#         churn-recheck = churn-noted, amended (FEE-R1.S2 THEN 12) and applied → recheck N-2 waits for reopen
#         churn-waiting = churn + active change feat-report created `--before feat-fee`: feat-fee holds the order note
#                   N-1 (source: feat-report), so every task approval of feat-fee waits until feat-report is archived (0.12)
#         churn-overlap = churn + two unlinked active changes on the same code (0.13.1, /hitl:overlap): feat-waive (premium
#                   customers settle without the fee: contradicts FEE-R1) and feat-report (the monthly report shows the fee
#                   of each settlement), both with a task on settle in src/settle.ts
# The plugin under test is never touched; the CLI used for set-up is this plugin's own hitl-index.
set -euo pipefail
H="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
FIX="$H/tests/fixtures"; HERE="$H/evals/fixtures"
kind="$1"; dest="$2"
CLI() { node "$H/scripts/hitl-index.mjs" "$@"; }
rm -rf "$dest"; mkdir -p "$dest"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
gitc() { git -C "$dest" init -q; git -C "$dest" add -A; git -C "$dest" -c user.email=e@x -c user.name=eval commit -qm fixture; }

case "$kind" in
  spec|plan|design|tasks|flow)
    cp -R "$FIX/ts-app/src" "$FIX/ts-app/tests" "$FIX/ts-app/package.json" "$dest/"
    cp "$FIX/ts-app/variants/src/services/userService.ts.green" "$dest/src/services/userService.ts"
    cp "$FIX/ts-app/variants/src/repo/userRepo.ts.manual" "$dest/src/repo/userRepo.ts"
    cp "$FIX/ts-app/variants/tests/userService.test.ts.red" "$dest/tests/userService.test.ts"
    cp -R "$FIX/spec-app/.hitl" "$dest/.hitl"
    rm -rf "$dest/.hitl/index"
    mkdir -p "$dest/.hitl/docs"; cp "$HERE"/docs/*.md "$dest/.hitl/docs/"
    # the ts-app sources carry task tags (QT-T1) of a quick task; strip them so the project is a plain codebase
    sed -i -E '/@task|@status|@impl|@prio|@dec |@calls|@concurrency/d' "$dest"/src/*/*.ts
    (cd "$dest" && CLI init --json >/dev/null && CLI index --all >/dev/null)
    C="$dest/.hitl/changes/feat-password-reset"
    case "$kind" in
      design|flow) rm -f "$C/design.md" "$C/tasks.md" ;;
      tasks) rm -f "$C/tasks.md" ;;
    esac
    gitc ;;
  review)
    cp -R "$FIX/ts-app/." "$dest/"; rm -rf "$dest/.hitl/index"
    mkdir -p "$dest/.hitl/docs"; cp "$HERE"/docs/*.md "$dest/.hitl/docs/"
    cd "$dest"
    CLI init --json >/dev/null; CLI index --all >/dev/null
    HITL_E2E=1 CLI approve QT-T1 --stage skeleton --by human --json >/dev/null
    cp variants/tests/userService.test.ts.red tests/userService.test.ts; CLI index >/dev/null
    CLI test --task QT-T1 --json >/dev/null
    HITL_E2E=1 CLI approve QT-T1 --stage tests --by human >/dev/null
    cp variants/src/services/userService.ts.green src/services/userService.ts
    cp variants/src/repo/userRepo.ts.manual src/repo/userRepo.ts
    CLI index >/dev/null; CLI test --task QT-T1 --json >/dev/null
    rm -rf variants
    gitc ;;
  churn|churn-noted|churn-recheck|churn-waiting|churn-overlap)
    cp -R "$HERE/churn-app/." "$dest/"
    mkdir -p "$dest/.hitl/docs"; cp "$HERE"/docs/*.md "$dest/.hitl/docs/"
    cd "$dest"
    CLI init --json >/dev/null; CLI index --all >/dev/null
    HITL_E2E=1 CLI approve FEE-T1 --stage skeleton --by human >/dev/null
    CLI test --task FEE-T1 --json >/dev/null
    HITL_E2E=1 CLI approve FEE-T1 --stage tests --by human >/dev/null
    sed -i -e 's|  // TODO(impl): 1. add the fee|  // 1. add the fee|' -e 's|  throw new Error("TODO(impl): settle");|  return amount + 1;|' src/settle.ts
    CLI index >/dev/null; CLI test --task FEE-T1 --json >/dev/null
    HITL_E2E=1 CLI approve FEE-T1 --stage done --by human --force >/dev/null
    CLI status --sync-tags >/dev/null
    if [ "$kind" = churn-waiting ]; then
      mkdir -p .hitl/changes/feat-report
      printf '%s\n' '<!-- audience: business -->' '# Monthly settlement report' \
        '> change: feat-report | key: REP | status: draft | created: 2026-11-05 | updated: 2026-11-05 | before: feat-fee' '' \
        '## Why' 'Finance needs the settlements of a month in one report before fees change.' '' \
        '## What changes' '- Finance can export the settlements of a month.' '' \
        '## Capabilities' '| capability | change | requirements |' '|---|---|---|' '| reporting | new | |' '' \
        '## Artifacts' '| artifact | decision | why |' '|---|---|---|' '| spec delta | included | always |' > .hitl/changes/feat-report/proposal.md
      CLI note add --change feat-fee --source feat-report --kind order --text "Monthly settlement report: feat-fee waits until it is archived." \
        --from "/hitl:plan feat-report --before feat-fee" >/dev/null
    elif [ "$kind" = churn-overlap ]; then
      ov_change() { # ov_change <id> <key> <title> <cap> <requirement> <given> <when> <then>
        mkdir -p ".hitl/changes/$1/specs/$4"
        printf '%s\n' '<!-- audience: business -->' "# $3" "> change: $1 | key: $2 | status: approved | created: 2026-11-05 | updated: 2026-11-05" '' \
          '## Why' "$3." '' '## What changes' "- $3." '' '## Capabilities' '| capability | change | requirements |' '|---|---|---|' \
          "| $4 | new | +$2-R1 |" '' '## Artifacts' '| artifact | decision | why |' '|---|---|---|' \
          '| spec delta | included | always |' '| design | skipped | small |' '| tasks | included | small |' > ".hitl/changes/$1/proposal.md"
        printf '%s\n' '<!-- audience: business -->' "# Delta: $4" "> capability: $4 | change: $1" '' '## Purpose' "$3." '' '## ADDED Requirements' \
          "### Requirement: $2-R1 $3" "$5" '' "#### Scenario: $2-R1.S1 $3" "- GIVEN $6" "- WHEN $7" "- THEN $8" > ".hitl/changes/$1/specs/$4/spec.md"
        printf '%s\n' "# $3 Tasks" "← Change: $1" '> status: approved' '' "## $2-T1 $3" \
          '- prio: P1 | risk: high (money) | impl: agent | blocked-by: none | status: todo' '' '### Acceptance criteria' \
          "- [ ] $2-T1.AC1 ($2-R1.S1) Given $6 When $7 Then $8" '' '### Test plan' '| ac | kind | oracle | seam | author |' \
          '|----|------|--------|------|--------|' '| AC1 | example | spec | settle | test-author |' '' '### Symbols' \
          "1. [ ] \`settle\` | modify | \`src/settle.ts\` | impl: agent | $3" > ".hitl/changes/$1/tasks.md"
      }
      ov_change feat-waive WAV "Premium customers settle free" billing \
        "When a premium customer's charge is settled, the system SHALL NOT add the settlement fee." \
        "a premium customer with an amount of 10" "it is settled" "the result is 10"
      ov_change feat-report REP "Monthly settlement report" reporting \
        "When a month ends, the system SHALL list every settlement of that month with the settlement fee it paid." \
        "a settlement of 10 in May" "the May report is made" "it shows a fee of 1"
    elif [ "$kind" != churn ]; then
      CLI note add --change feat-fee --kind spec --refs FEE-R1.S2 --text "The settlement fee is 2, not 1. Finance changed it on 2026-11-04." \
        --from "user, during /hitl:implement FEE-T2" >/dev/null
    fi
    if [ "$kind" = churn-recheck ]; then
      sed -i -e 's/settlement fee of 1/settlement fee of 2/' -e 's/- THEN the result is 11/- THEN the result is 12/' .hitl/changes/feat-fee/specs/billing/spec.md
      sed -i 's/Given 10 When settle Then 11/Given 10 When settle Then 12/' .hitl/changes/feat-fee/tasks.md
      CLI note apply --change feat-fee N-1 --impact FEE-R1.S2=behaviour --from "/hitl:plan feat-fee amend N-1" >/dev/null
    fi
    gitc ;;
  lua)
    cp -R "$HERE/lua-app/." "$dest/"
    (cd "$dest" && CLI init --json >/dev/null && CLI index --all >/dev/null)
    gitc ;;
  *) echo "unknown kind: $kind" >&2; exit 2 ;;
esac
echo "$dest"

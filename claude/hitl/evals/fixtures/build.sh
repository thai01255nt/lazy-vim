#!/usr/bin/env bash
# Build a throw-away project for one eval scenario.
# Usage: evals/fixtures/build.sh <kind> <dest>
#   kind: spec      ts-app code + spec-app .hitl (approved change feat-password-reset with design + tasks) + docs
#         plan      = spec (a new feature is planned on top)
#         design    = spec, minus design.md/tasks.md of feat-password-reset (proposal approved)
#         tasks     = spec, minus tasks.md (spec + design approved)
#         flow      = design (next step should be /hitl:design feat-password-reset)
#         review    ts-app (v0.5 tasks file) driven to "T-1 implemented, tests green, skeleton+tests locked"
#         lua       lua-app (pure Lua + LuaLS annotations, busted) with approved change feat-burst-credit, T-1 todo
#         churn     churn-app (node:test) with approved change feat-fee: T-1 settle done (2 locked tests), T-2 todo
#         churn-noted   = churn + open note N-1 "the fee is 2, not 1" (refs BIL-R1.S2; touches T-1)
#         churn-recheck = churn-noted, amended (BIL-R1.S2 THEN 12) and applied → recheck N-2 waits for reopen
#         churn-waiting = churn + active change feat-report created `--before feat-fee`: feat-fee holds the order note
#                   N-1 (source: feat-report), so every task approval of feat-fee waits until feat-report is archived (0.12)
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
    # the ts-app sources carry T-1 tags of a v0.5 change; strip them so the project is a plain codebase
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
    HITL_E2E=1 CLI approve T-1 --stage skeleton --by human --json >/dev/null
    cp variants/tests/userService.test.ts.red tests/userService.test.ts; CLI index >/dev/null
    CLI test --task T-1 --json >/dev/null
    HITL_E2E=1 CLI approve T-1 --stage tests --by human >/dev/null
    cp variants/src/services/userService.ts.green src/services/userService.ts
    cp variants/src/repo/userRepo.ts.manual src/repo/userRepo.ts
    CLI index >/dev/null; CLI test --task T-1 --json >/dev/null
    rm -rf variants
    gitc ;;
  churn|churn-noted|churn-recheck|churn-waiting)
    cp -R "$HERE/churn-app/." "$dest/"
    mkdir -p "$dest/.hitl/docs"; cp "$HERE"/docs/*.md "$dest/.hitl/docs/"
    cd "$dest"
    CLI init --json >/dev/null; CLI index --all >/dev/null
    HITL_E2E=1 CLI approve T-1 --stage skeleton --by human >/dev/null
    CLI test --task T-1 --json >/dev/null
    HITL_E2E=1 CLI approve T-1 --stage tests --by human >/dev/null
    sed -i -e 's|  // TODO(impl): 1. add the fee|  // 1. add the fee|' -e 's|  throw new Error("TODO(impl): settle");|  return amount + 1;|' src/settle.ts
    CLI index >/dev/null; CLI test --task T-1 --json >/dev/null
    HITL_E2E=1 CLI approve T-1 --stage done --by human --force >/dev/null
    CLI status --sync-tags >/dev/null
    if [ "$kind" = churn-waiting ]; then
      mkdir -p .hitl/changes/feat-report
      printf '%s\n' '<!-- audience: business -->' '# Monthly settlement report' \
        '> change: feat-report | status: draft | created: 2026-11-05 | updated: 2026-11-05 | before: feat-fee' '' \
        '## Why' 'Finance needs the settlements of a month in one report before fees change.' '' \
        '## What changes' '- Finance can export the settlements of a month.' '' \
        '## Capabilities' '| capability | key | change | requirements |' '|---|---|---|---|' '| reporting | REP | new | |' '' \
        '## Artifacts' '| artifact | decision | why |' '|---|---|---|' '| spec delta | included | always |' > .hitl/changes/feat-report/proposal.md
      CLI note add --change feat-fee --source feat-report --kind order --text "Monthly settlement report: feat-fee waits until it is archived." \
        --from "/hitl:plan feat-report --before feat-fee" >/dev/null
    elif [ "$kind" != churn ]; then
      CLI note add --change feat-fee --kind spec --refs BIL-R1.S2 --text "The settlement fee is 2, not 1. Finance changed it on 2026-11-04." \
        --from "user, during /hitl:implement T-2" >/dev/null
    fi
    if [ "$kind" = churn-recheck ]; then
      sed -i -e 's/settlement fee of 1/settlement fee of 2/' -e 's/- THEN the result is 11/- THEN the result is 12/' .hitl/changes/feat-fee/specs/billing/spec.md
      sed -i 's/Given 10 When settle Then 11/Given 10 When settle Then 12/' .hitl/changes/feat-fee/tasks.md
      CLI note apply --change feat-fee N-1 --impact BIL-R1.S2=behaviour --from "/hitl:plan feat-fee amend N-1" >/dev/null
    fi
    gitc ;;
  lua)
    cp -R "$HERE/lua-app/." "$dest/"
    (cd "$dest" && CLI init --json >/dev/null && CLI index --all >/dev/null)
    gitc ;;
  *) echo "unknown kind: $kind" >&2; exit 2 ;;
esac
echo "$dest"

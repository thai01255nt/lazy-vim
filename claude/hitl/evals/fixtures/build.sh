#!/usr/bin/env bash
# Build a throw-away project for one eval scenario.
# Usage: evals/fixtures/build.sh <kind> <dest>
#   kind: spec      ts-app code + spec-app .hitl (approved change feat-password-reset with design + tasks) + docs
#         plan      = spec (a new feature is planned on top)
#         design    = spec, minus design.md/tasks.md of feat-password-reset (proposal approved)
#         tasks     = spec, minus tasks.md (spec + design approved)
#         flow      = design (next step should be /hitl:design feat-password-reset)
#         review    ts-app (v0.5 tasks file) driven to "T-1 implemented, tests green, skeleton+tests locked"
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
  *) echo "unknown kind: $kind" >&2; exit 2 ;;
esac
echo "$dest"

# v3 spec layer — `hitl-index spec validate → merge --dry-run → archive` and `hitl-index change` on a temp copy of
# tests/fixtures/spec-app — sourced by tests/e2e.sh (interface I4).
SP="$W/spec-app"

sS1() {
  cp -R "$FIX/spec-app" "$SP"
  cd "$SP"
  CLI spec validate --json > "$W/s1.json"
  afile "$W/s1.json" 'd.schema === "hitl.spec-validate/1" && d.ok && d.counts.error === 0 && d.summary[0].capability === "accounts"'
  afile "$W/s1.json" 'has(d.summary[0].added, "ACC-R5") && has(d.summary[0].removed, "ACC-R2")'
  [ -f .hitl/changes/feat-password-reset/.base.json ] || { echo "validate did not record .base.json"; return 1; }
  CLI change --json > "$W/s1c.json"
  afile "$W/s1c.json" 'd.changes[0].id === "feat-password-reset" && d.changes[0].phase === "implement" && d.changes[1].phase === "archived"'
  [ "$(CLI spec next-id accounts)" = "ACC-R7" ] || { echo "next-id"; return 1; }
}
step S1 "spec validate: fixture clean, summary + .base.json; change phases; next-id over living+retired+deltas" sS1

sS2() {
  cd "$SP"
  cp .hitl/specs/accounts/spec.md "$W/s2.before"
  CLI spec merge feat-password-reset --dry-run --json > "$W/s2.json"
  afile "$W/s2.json" 'd.schema === "hitl.spec-merge/1" && d.dryRun && d.ok && d.capabilities[0].modified[0] === "ACC-R1" && d.glossary.added[0] === "Reset link"'
  cmp .hitl/specs/accounts/spec.md "$W/s2.before"
  CLI spec conflicts --json | aj 'd.schema === "hitl.spec-conflicts/1" && d.conflicts.length === 0'
}
step S2 "spec merge --dry-run: plan only, nothing written; no conflicts" sS2

sS3() {
  cd "$SP"
  expect_exit 1 CLI spec archive feat-password-reset --json > "$W/s3a.json"
  afile "$W/s3a.json" '!d.ok && d.preconditions.tasks.notDone[0] === "T-13" && !d.archive.moved'
  [ -d .hitl/changes/feat-password-reset ] || { echo "blocked archive moved the change"; return 1; }
  CLI spec archive feat-password-reset --force --json > "$W/s3b.json"
  afile "$W/s3b.json" 'd.ok && d.archive.moved'
  local to; to=".hitl/archive/$(date +%F)-feat-password-reset"
  [ -f "$to/proposal.md" ] && [ ! -e .hitl/changes/feat-password-reset ] || { echo "archive dir not moved to $to"; ls -R .hitl; return 1; }
  contains .hitl/specs/accounts/spec.md "### Requirement: ACC-R5 Reset password by email"
  contains .hitl/specs/accounts/spec.md "- ACC-R2 Remember me — removed by feat-password-reset"
  contains .hitl/specs/GLOSSARY.md "### Term: Reset link"
  CLI spec validate --json | aj 'd.ok && d.counts.error === 0'
  expect_exit 1 CLI spec archive feat-password-reset
}
step S3 "spec archive: blocked by an unfinished task (nothing written), --force merges + moves; living specs valid" sS3

#!/usr/bin/env node
// Re-grade every finished run under <out>/<suite>/ with the current grade.mjs (no new claude calls).
//   node evals/regrade.mjs <out> <suite> NAME=DIR [NAME=DIR...]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gradeRun } from "./grade.mjs";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const [out, suite, ...vs] = process.argv.slice(2);
const cases = JSON.parse(fs.readFileSync(path.join(HERE, suite === "trigger" ? "trigger.json" : "scenarios.json"), "utf8")).cases;
for (const v of vs) {
  const [name, dir] = v.split("=");
  for (const c of cases) {
    const cd = path.join(out, suite, name, c.id);
    if (!fs.existsSync(cd)) continue;
    for (const r of fs.readdirSync(cd)) {
      const f = path.join(cd, r, "grade.json");
      if (!fs.existsSync(f)) continue;
      const old = JSON.parse(fs.readFileSync(f, "utf8"));
      const g = gradeRun({ suite, c, dir: path.join(cd, r), proj: path.join(cd, r, "proj"), pluginDir: path.resolve(dir), exit: old.exit });
      Object.assign(g, { variant: name, case: c.id, run: Number(r) });
      fs.writeFileSync(f, JSON.stringify(g, null, 1));
      console.log(`${g.pass ? "✅" : "❌"} ${name} ${c.id} #${r} ${Object.entries(g.checks).filter(([, x]) => !x.ok).map(([k, x]) => `${k}: ${x.why}`).join("; ")}`);
    }
  }
}

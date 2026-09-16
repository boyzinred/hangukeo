/**
 * Validates and imports a hand-authored weekly test.
 *
 *   npm run test:import -- --week 3           # validate only, writes nothing
 *   npm run test:import -- --week 3 --apply   # write it
 *
 * Dry run is the default on purpose: an import replaces the week's test, and
 * a half-applied bad file is worse than a rejected one.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { applyTestFile, validateTestFile, type WeekTestFile } from "../lib/test-import";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const week = Number(arg("week"));
  if (!Number.isFinite(week)) {
    console.error(
      "Usage: npm run test:import -- --week 3 [--apply] [--file path.ts]",
    );
    process.exit(1);
  }

  const rel =
    arg("file") ?? `src/tests/week-${String(week).padStart(2, "0")}.ts`;
  const full = path.resolve(rel);
  if (!existsSync(full)) {
    console.error(`No such file: ${rel}`);
    console.error(`Run \`npm run test:brief -- --week ${week}\` to get started.`);
    process.exit(1);
  }

  const mod = (await import(full)) as {
    default?: WeekTestFile;
    test?: WeekTestFile;
  };
  const file = mod.default ?? mod.test;
  if (!file) {
    console.error(`${rel} must default-export the test.`);
    process.exit(1);
  }
  if (file.weekNumber !== week) {
    console.error(
      `${rel} says week ${file.weekNumber} but was imported as week ${week}.`,
    );
    process.exit(1);
  }

  const report = await validateTestFile(file);

  const errors = report.findings.filter((f) => f.level === "error");
  const warnings = report.findings.filter((f) => f.level === "warning");

  console.log(`\nWeek ${report.summary.weekNumber} — ${rel}`);
  console.log(
    `  ${report.summary.total} questions: ${report.summary.vocabNew} new, ` +
      `${report.summary.vocabReview} review, ${report.summary.grammar} grammar, ` +
      `${report.summary.reading} reading`,
  );
  if (report.summary.vocabNew + report.summary.vocabReview > 0) {
    console.log(`  review share: ${report.summary.reviewSharePct}%`);
  }

  if (warnings.length) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const w of warnings) console.log(`  · ${w.message}`);
  }
  if (errors.length) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`  ✗ ${e.message}`);
    console.log("\nNothing was written.");
    process.exit(1);
  }

  if (!has("apply")) {
    console.log("\nValid. Nothing written — add --apply to import it.");
    process.exit(0);
  }

  const result = await applyTestFile(file);
  console.log(
    `\n${result.replaced ? "Replaced" : "Imported"} as a draft (${result.testId}).`,
  );
  console.log("Nobody can see it yet. Open /teacher/tests, read it through,");
  console.log("and publish from the preview when it is right.");
  process.exit(0);
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : e}`);
  process.exit(1);
});

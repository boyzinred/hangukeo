/**
 * Puts the authored tests on top of the demo results.
 *
 * `seed-demo` fabricates two tests of its own so the teacher dashboard has
 * numbers on it. Those are fixtures: they were written before tests were
 * authored as files, and they do not look like anything the class would
 * actually sit. This replaces week 1 with the real file, publishes it, and has
 * the class sit it, so the demo shows a genuine multiple-choice test with
 * genuine results. Week 3 comes in as a draft, which is what an unpublished
 * test looks like.
 *
 * It writes attempts for every student on the roster, so against a hosted
 * database it insists on --apply and says whose results it is about to invent.
 * Those results are indistinguishable from real ones afterwards, which is fine
 * for a demonstration and wrong for a class that has started.
 *
 *   npm run db:demo:tests
 *   npm run db:demo:tests:cloud -- --apply
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { existsSync } from "node:fs";
import path from "node:path";
import { db } from "./index";
import { attempts, questions, tests, users, weekPlans } from "./schema";
import { applyTestFile, auditTest, type WeekTestFile } from "../lib/test-import";
import { setTestStatus } from "../lib/tests";
import { saveAnswer, startOrResume, submitAttempt } from "../lib/test-taking";

const FILES = [1, 3];
/** Published and sat, so the dashboard has something to show. */
const SIT = 1;

async function importWeek(week: number): Promise<string | null> {
  const rel = `src/tests/week-${String(week).padStart(2, "0")}.ts`;
  if (!existsSync(path.resolve(rel))) {
    console.log(`  week ${week}: no ${rel}, skipped`);
    return null;
  }
  const mod = (await import(path.resolve(rel))) as { default: WeekTestFile };

  // seed-demo's fixture attempts would block the import, and they are exactly
  // what this is replacing.
  const [existing] = await db
    .select({ id: tests.id })
    .from(tests)
    .innerJoin(weekPlans, eq(weekPlans.id, tests.weekPlanId))
    .where(eq(weekPlans.weekNumber, week));
  if (existing) {
    await db.delete(attempts).where(eq(attempts.testId, existing.id));
  }

  const { testId, summary } = await applyTestFile(mod.default);
  console.log(
    `  week ${week}: ${summary.total} questions — ${summary.vocabNew} new, ${summary.vocabReview} review, ${summary.grammar} grammar, ${summary.reading} reading`,
  );
  return testId;
}

async function sit(testId: string) {
  const audit = await auditTest(testId);
  if (!audit.ok) throw new Error("audit failed, refusing to publish");
  await setTestStatus(testId, "published");

  const students = await db
    .select()
    .from(users)
    .where(sql`'student' = any(${users.roles})`)
    .orderBy(asc(users.displayName));

  await db.delete(attempts).where(
    and(eq(attempts.testId, testId), inArray(attempts.studentId, students.map((s) => s.id))),
  );

  const qs = await db.select().from(questions).where(eq(questions.testId, testId));
  const byId = new Map(qs.map((q) => [q.id, q]));

  for (const [i, s] of students.entries()) {
    const active = await startOrResume(s.id, testId);
    // A spread of ability, and a couple of students who run out of time.
    const ability = 0.45 + (i % 6) * 0.09;
    for (const [n, q] of active.questions.entries()) {
      if (i % 5 === 0 && n > active.questions.length - 3) continue;
      const real = byId.get(q.id)!;
      const right = Math.random() < ability;
      await saveAnswer(
        s.id,
        active.attemptId,
        q.id,
        right ? real.correctAnswer : real.choices!.find((c) => c !== real.correctAnswer)!,
      );
    }
    await submitAttempt(s.id, active.attemptId);
  }
  console.log(`  ${students.length} students sat it`);
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const isLocal = url.includes("127.0.0.1") || url.includes("localhost");
  const apply = process.argv.includes("--apply");

  if (!isLocal) {
    const students = await db
      .select({ username: users.username })
      .from(users)
      .where(sql`'student' = any(${users.roles})`)
      .orderBy(asc(users.username));

    console.log(`target: ${new URL(url || "postgres://unset").host}\n`);
    console.log(
      `This invents test results for ${students.length} student${students.length === 1 ? "" : "s"}:`,
    );
    console.log(`  ${students.map((s) => s.username).join(", ") || "(nobody)"}\n`);

    if (students.length === 0) {
      console.log(
        "Nobody on the roster holds the student role, so there is no class to sit it.",
      );
    }
    if (!apply) {
      console.log("Nothing written — add --apply to go ahead.");
      process.exit(0);
    }
    console.log("Writing.\n");
  }

  console.log("importing authored tests...");
  const ids = new Map<number, string>();
  for (const week of FILES) {
    const id = await importWeek(week);
    if (id) ids.set(week, id);
  }

  const toSit = ids.get(SIT);
  if (toSit) {
    console.log(`\npublishing week ${SIT} and sitting it...`);
    await sit(toSit);
  }
  console.log("\ndone");
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

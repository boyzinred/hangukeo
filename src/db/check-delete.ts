/**
 * Checks the delete guards and that a delete actually removes everything.
 *
 * Exercises lib/accounts.ts directly (the server action adds the teacher check
 * and the typed confirmation on top, which are asserted separately by reading
 * the action's own rules). Cleans up after itself.
 *
 * Run with `npm run check:delete`.
 */
import { asc, eq, sql } from "drizzle-orm";
import { db } from "./index";
import {
  attempts,
  practiceResponses,
  practiceRuns,
  questions,
  responses,
  teamMembers,
  teams,
  tests,
  users,
  weekPlans,
} from "./schema";
import { accountImpact, createAccount, deleteAccount } from "../lib/accounts";

let failures = 0;
function expect(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok    ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function count(table: string, userId: string) {
  const { rows } = await db.execute(
    sql.raw(
      `select count(*)::int as n from ${table} where student_id = '${userId}'`,
    ),
  );
  return (rows[0] as { n: number }).n;
}

async function main() {
  // Everything this check needs is looked up before anything is created, so a
  // missing fixture cannot leave a half-made account behind. It used to create
  // the student first and exit on the next line, which is why the roster
  // collected "Delete Check" rows nobody could account for.
  //
  // Any test with questions will do. Picking the first *week plan* and hoping
  // it had one failed with an unreadable "reading 'id' of undefined" whenever
  // the checks had cleared week 1 before this ran.
  const [test] = await db
    .select()
    .from(tests)
    .innerJoin(weekPlans, eq(weekPlans.id, tests.weekPlanId))
    .orderBy(asc(weekPlans.weekNumber))
    .limit(1);
  if (!test) {
    console.error(
      "No test in the database to attach results to. Run `npm run db:seed:demo` first.",
    );
    process.exit(1);
  }
  const testId = test.tests.id;

  const [team] = await db.select().from(teams).limit(1);
  if (!team) {
    console.error("No teams. Run `npm run db:seed` first.");
    process.exit(1);
  }

  const username = `deletecheck${Date.now().toString().slice(-5)}`;
  const account = await createAccount({
    username,
    displayName: "Delete Check",
    roles: ["student"],
    teamId: team.id,
  });
  const userId = account.userId;

  // Give them results so the impact numbers are non-zero and the cascade is
  // actually exercised.
  const qs = await db
    .select()
    .from(questions)
    .where(eq(questions.testId, testId))
    .limit(3);

  const [attempt] = await db
    .insert(attempts)
    .values({
      testId,
      studentId: userId,
      state: "submitted",
      expiresAt: new Date(Date.now() + 3600_000),
      submittedAt: new Date(),
      score: 2,
      maxScore: 3,
    })
    .returning();
  await db.insert(responses).values(
    qs.map((q) => ({
      attemptId: attempt.id,
      questionId: q.id,
      studentId: userId,
      vocabId: q.vocabId,
      grammarId: q.grammarId,
      answer: "x",
      isCorrect: true,
    })),
  );
  const [run] = await db
    .insert(practiceRuns)
    .values({
      studentId: userId,
      kind: "vocab",
      direction: "ko_to_en",
      total: 2,
      firstTryCorrect: 1,
    })
    .returning();
  await db.insert(practiceResponses).values(
    qs.slice(0, 2).map((q) => ({
      runId: run.id,
      studentId: userId,
      vocabId: q.vocabId,
      firstTry: true,
      isCorrect: true,
    })),
  );

  // This person also approved a test and granted a retake — the two
  // references that used to be NO ACTION and would have blocked the delete.
  await db.update(tests).set({ approvedBy: userId }).where(eq(tests.id, testId));
  await db
    .update(attempts)
    .set({ retakeGrantedBy: userId })
    .where(eq(attempts.id, attempt.id));

  console.log("impact report");
  const impact = await accountImpact(userId);
  expect("counts test attempts", impact?.testAttempts === 1, `${impact?.testAttempts}`);
  expect("counts test answers", impact?.testAnswers === qs.length, `${impact?.testAnswers}`);
  expect("counts practice runs", impact?.practiceRuns === 1, `${impact?.practiceRuns}`);
  expect("counts practice answers", impact?.practiceAnswers === 2, `${impact?.practiceAnswers}`);

  console.log("\ndelete");
  await deleteAccount(userId);

  const gone = await db.select().from(users).where(eq(users.id, userId));
  expect("roster row removed", gone.length === 0);
  expect("attempts cascaded", (await count("attempts", userId)) === 0);
  expect("responses cascaded", (await count("responses", userId)) === 0);
  expect("practice runs cascaded", (await count("practice_runs", userId)) === 0);
  expect("practice answers cascaded", (await count("practice_responses", userId)) === 0);

  const stillMember = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.studentId, userId));
  expect("team membership cascaded", stillMember.length === 0);

  // The point of the FK fix: the test survives its approver being deleted.
  const [survivingTest] = await db.select().from(tests).where(eq(tests.id, testId));
  expect("test survived its approver being deleted", !!survivingTest);
  expect("approved_by nulled rather than blocking", survivingTest?.approvedBy === null);

  console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

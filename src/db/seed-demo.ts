import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./index";
import {
  attempts,
  corpusGrammar,
  corpusVocab,
  questions,
  practiceResponses,
  practiceRuns,
  responses,
  tests,
  users,
  weekPlanGrammar,
  weekPlanVocab,
  weekPlans,
} from "./schema";

/**
 * Demo results, layered on top of `db:seed`.
 *
 * The base seed leaves the term at its real starting state — no tests taken.
 * That is correct but makes the teacher dashboard impossible to review, so this
 * script fabricates two completed weekly tests with a realistic spread of
 * student performance.
 *
 * Test 2 re-tests 8 words from test 1, which is what lets anything reach
 * mastery (correct on 2 distinct tests, most recent answer correct).
 */

const VOCAB_PER_TEST = 20;
const REPEATS_FROM_TEST_1 = 8;

/** Rough ability per student, in first-try accuracy. */
function abilityFor(index: number): number {
  return 0.45 + (index % 5) * 0.12 + (index % 3) * 0.03;
}

async function main() {
  console.log("seeding demo results...");

  await db.delete(practiceResponses);
  await db.delete(practiceRuns);
  await db.delete(responses);
  await db.delete(attempts);
  await db.delete(questions);
  await db.delete(tests);

  const students = await db
    .select()
    .from(users)
    .where(sql`'student' = any(${users.roles})`)
    .orderBy(asc(users.displayName));
  if (students.length === 0) throw new Error("run `npm run db:seed` first");

  const plans = await db
    .select()
    .from(weekPlans)
    .orderBy(asc(weekPlans.weekNumber))
    .limit(2);

  let previousVocabIds: string[] = [];

  for (const [i, plan] of plans.entries()) {
    const weekVocab = await db
      .select({ id: corpusVocab.id, korean: corpusVocab.korean, english: corpusVocab.english, accepted: corpusVocab.acceptedAnswers })
      .from(weekPlanVocab)
      .innerJoin(corpusVocab, eq(corpusVocab.id, weekPlanVocab.vocabId))
      .where(eq(weekPlanVocab.weekPlanId, plan.id))
      .orderBy(asc(corpusVocab.id));

    const weekGrammar = await db
      .select({ id: corpusGrammar.id, form: corpusGrammar.form, name: corpusGrammar.name })
      .from(weekPlanGrammar)
      .innerJoin(corpusGrammar, eq(corpusGrammar.id, weekPlanGrammar.grammarId))
      .where(eq(weekPlanGrammar.weekPlanId, plan.id));

    // Week 2 mixes in words from week 1 so they can be seen on two tests.
    const repeats = i === 0 ? [] : previousVocabIds.slice(0, REPEATS_FROM_TEST_1);
    const repeatRows = repeats.length
      ? await db
          .select({ id: corpusVocab.id, korean: corpusVocab.korean, english: corpusVocab.english, accepted: corpusVocab.acceptedAnswers })
          .from(corpusVocab)
          .where(inArray(corpusVocab.id, repeats))
      : [];

    const freshCount = VOCAB_PER_TEST - repeatRows.length;
    const fresh = weekVocab.slice(0, freshCount);
    const vocabForTest = [...fresh, ...repeatRows];
    if (i === 0) previousVocabIds = fresh.map((v) => v.id);

    const [test] = await db
      .insert(tests)
      .values({
        weekPlanId: plan.id,
        title: `Week ${plan.weekNumber} test`,
        status: "closed",
        // No passage: this fixture asks no reading questions, and a passage
        // nothing asks about is exactly what the validator warns on.
        timeLimitMinutes: 30,
        spec: { vocab: vocabForTest.length, grammar: weekGrammar.length, repeats: repeatRows.length },
        opensAt: new Date(`${plan.endsOn}T09:00:00Z`),
        closesAt: new Date(`${plan.endsOn}T21:00:00Z`),
      })
      .returning();

    const questionRows = await db
      .insert(questions)
      .values([
        ...vocabForTest.map((v, n) => ({
          testId: test.id,
          kind: "vocab" as const,
          vocabId: v.id,
          format: (n % 2 === 0 ? "ko_to_en_typed" : "en_to_ko_typed") as
            | "ko_to_en_typed"
            | "en_to_ko_typed",
          section: "vocabulary",
          position: n + 1,
          prompt: n % 2 === 0 ? v.korean : v.english,
          correctAnswer: n % 2 === 0 ? v.english : v.korean,
          acceptedAnswers: n % 2 === 0 ? v.accepted : [v.korean],
        })),
        ...weekGrammar.map((g, n) => ({
          testId: test.id,
          kind: "grammar" as const,
          grammarId: g.id,
          format: "grammar_choice" as const,
          section: "grammar",
          position: vocabForTest.length + n + 1,
          prompt: `What does ${g.form} express?`,
          // The other patterns on the same test are the distractors, which is
          // what an authored test does. Without choices at all these rows read
          // as a malformed test to anything that inspects them later.
          choices: weekGrammar.map((o) => o.name),
          correctAnswer: g.name,
          acceptedAnswers: [g.name],
        })),
      ])
      .returning();

    for (const [si, student] of students.entries()) {
      const ability = Math.min(0.97, abilityFor(si) + i * 0.06); // everyone improves a little
      const startedAt = new Date(`${plan.endsOn}T10:00:00Z`);

      const [attempt] = await db
        .insert(attempts)
        .values({
          testId: test.id,
          studentId: student.id,
          attemptNumber: 1,
          state: "submitted",
          startedAt,
          expiresAt: new Date(startedAt.getTime() + 30 * 60000),
          submittedAt: new Date(startedAt.getTime() + 22 * 60000),
          maxScore: questionRows.length,
        })
        .returning();

      // Deterministic per (student, question) so re-running gives the same picture.
      const answers = questionRows.map((q, qi) => {
        const roll = ((si * 31 + qi * 17 + i * 7) % 100) / 100;
        const correct = roll < ability;
        return {
          attemptId: attempt.id,
          questionId: q.id,
          studentId: student.id,
          vocabId: q.vocabId,
          grammarId: q.grammarId,
          answer: correct ? q.correctAnswer : "???",
          isCorrect: correct,
          answeredAt: new Date(startedAt.getTime() + qi * 45000),
        };
      });

      await db.insert(responses).values(answers);
      await db
        .update(attempts)
        .set({ score: answers.filter((a) => a.isCorrect).length })
        .where(eq(attempts.id, attempt.id));
    }

    console.log(
      `  week ${plan.weekNumber}: ${questionRows.length} questions (${repeatRows.length} repeats), ${students.length} attempts`,
    );
  }

  // --- practice history ------------------------------------------------
  //
  // Studied is the number that tracks the semester goal, and it comes from
  // practice rather than tests, so the dashboard needs practice data to mean
  // anything. Coverage varies per student: the diligent ones have drilled most
  // of what they were assigned, the others barely started.
  const assigned = await db
    .select({ id: corpusVocab.id })
    .from(weekPlanVocab)
    .innerJoin(corpusVocab, eq(corpusVocab.id, weekPlanVocab.vocabId))
    .innerJoin(weekPlans, eq(weekPlans.id, weekPlanVocab.weekPlanId))
    .orderBy(asc(weekPlans.weekNumber), asc(corpusVocab.id));

  const assignedGrammar = await db
    .select({ id: corpusGrammar.id })
    .from(weekPlanGrammar)
    .innerJoin(corpusGrammar, eq(corpusGrammar.id, weekPlanGrammar.grammarId))
    .innerJoin(weekPlans, eq(weekPlans.id, weekPlanGrammar.weekPlanId))
    .limit(8);

  for (const [si, student] of students.entries()) {
    // 25% to 95% of the first two weeks' words attempted.
    const coverage = 0.25 + (si % 6) * 0.14;
    const ability = abilityFor(si);
    const pool = assigned.slice(0, Math.round(250 * Math.min(1, coverage)));

    const [run] = await db
      .insert(practiceRuns)
      .values({
        studentId: student.id,
        kind: "vocab",
        direction: "ko_to_en",
        total: pool.length,
        firstTryCorrect: 0,
        scope: { demo: true, weeks: [1, 2] },
      })
      .returning();

    const rows = pool.map((v, n) => {
      const roll = ((si * 13 + n * 29) % 100) / 100;
      const firstTry = roll < ability;
      return {
        runId: run.id,
        studentId: student.id,
        vocabId: v.id,
        grammarId: null,
        firstTry,
        isCorrect: true, // the drill retries until right
      };
    });
    await db.insert(practiceResponses).values(rows);
    await db
      .update(practiceRuns)
      .set({ firstTryCorrect: rows.filter((r) => r.firstTry).length })
      .where(eq(practiceRuns.id, run.id));

    if (assignedGrammar.length) {
      const [grun] = await db
        .insert(practiceRuns)
        .values({
          studentId: student.id,
          kind: "grammar",
          direction: "ko_to_en",
          total: assignedGrammar.length,
          firstTryCorrect: 0,
          scope: { demo: true },
        })
        .returning();
      const grows = assignedGrammar.map((g, n) => ({
        runId: grun.id,
        studentId: student.id,
        vocabId: null,
        grammarId: g.id,
        firstTry: ((si * 7 + n * 11) % 100) / 100 < ability,
        isCorrect: true,
      }));
      await db.insert(practiceResponses).values(grows);
      await db
        .update(practiceRuns)
        .set({ firstTryCorrect: grows.filter((r) => r.firstTry).length })
        .where(eq(practiceRuns.id, grun.id));
    }
  }

  console.log(`  practice: ${students.length} students with drill history`);
  console.log("done — teacher dashboard now has results to show");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

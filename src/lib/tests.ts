import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  attempts,
  corpusGrammar,
  corpusVocab,
  questions,
  tests,
  weekPlanVocab,
  weekPlans,
} from "@/db/schema";

/**
 * Reading and administering weekly tests.
 *
 * A test is never composed here. It is written as a file, checked against the
 * corpus and the week plan by `test-import.ts`, and imported as a draft. This
 * module is what the screens read afterwards: the list, the teacher's preview,
 * a student's history, and the status transitions.
 *
 * There used to be a second path — a sampler that built a test straight from
 * the week plan at the press of a button. It has been removed. It produced no
 * reading passage, wrote a different `spec` shape, and bypassed the validator
 * that every statistic depends on, so a teacher could publish a test that
 * scored fine and contributed nothing to studied, verified or retention.
 */

export type TestStatus = "draft" | "review" | "published" | "closed";

/** The week's test as the student screens need it. */
export async function testForWeek(weekNumber: number) {
  const [row] = await db
    .select({
      id: tests.id,
      title: tests.title,
      status: tests.status,
      timeLimitMinutes: tests.timeLimitMinutes,
      weekNumber: weekPlans.weekNumber,
      spec: tests.spec,
      questionCount: sql<number>`(select count(*) from ${questions} q where q.test_id = ${tests.id})::int`,
    })
    .from(tests)
    .innerJoin(weekPlans, eq(weekPlans.id, tests.weekPlanId))
    .where(eq(weekPlans.weekNumber, weekNumber))
    .limit(1);
  return row ?? null;
}

/** Questions for a test, in order. Carries the answers — staff only. */
export async function testQuestions(testId: string) {
  return db
    .select()
    .from(questions)
    .where(eq(questions.testId, testId))
    .orderBy(asc(questions.position));
}

/**
 * One question as the teacher's preview shows it.
 *
 * `link` is the corpus entry the question feeds. A question without one scores
 * but contributes to no statistic, which the preview says out loud rather than
 * leaving it to be discovered in the numbers weeks later.
 */
export type PreviewQuestion = {
  id: string;
  position: number;
  section: string;
  format: string;
  prompt: string;
  choices: string[] | null;
  correctAnswer: string;
  acceptedAnswers: string[];
  link:
    | {
        kind: "vocab";
        id: string;
        korean: string;
        english: string;
        /** Which week assigned it — this week is new, an earlier one is review. */
        assignedWeek: number | null;
      }
    | { kind: "grammar"; id: string; form: string; name: string; meaning: string }
    | null;
};

export type TestDetail = {
  id: string;
  title: string;
  status: TestStatus;
  weekNumber: number;
  weekKey: string;
  startsOn: string;
  endsOn: string;
  timeLimitMinutes: number;
  passageKo: string | null;
  passageEn: string | null;
  spec: unknown;
  approvedAt: Date | null;
  createdAt: Date;
  attemptCount: number;
  submittedCount: number;
  questions: PreviewQuestion[];
};

/** Everything the preview renders: the test, its passage, and every question. */
export async function testDetail(testId: string): Promise<TestDetail | null> {
  const [row] = await db
    .select({ test: tests, plan: weekPlans })
    .from(tests)
    .innerJoin(weekPlans, eq(weekPlans.id, tests.weekPlanId))
    .where(eq(tests.id, testId))
    .limit(1);
  if (!row) return null;

  const qs = await testQuestions(testId);

  const vocabIds = [...new Set(qs.flatMap((q) => (q.vocabId ? [q.vocabId] : [])))];
  const grammarIds = [...new Set(qs.flatMap((q) => (q.grammarId ? [q.grammarId] : [])))];

  const vocabRows = vocabIds.length
    ? await db.select().from(corpusVocab).where(inArray(corpusVocab.id, vocabIds))
    : [];
  const grammarRows = grammarIds.length
    ? await db.select().from(corpusGrammar).where(inArray(corpusGrammar.id, grammarIds))
    : [];

  // Which week assigned each word, so the preview can mark new against review
  // without the caller counting anything itself.
  const assignedRows = vocabIds.length
    ? await db
        .select({
          vocabId: weekPlanVocab.vocabId,
          weekNumber: weekPlans.weekNumber,
        })
        .from(weekPlanVocab)
        .innerJoin(weekPlans, eq(weekPlans.id, weekPlanVocab.weekPlanId))
        .where(inArray(weekPlanVocab.vocabId, vocabIds))
    : [];
  const assignedWeek = new Map(assignedRows.map((r) => [r.vocabId, r.weekNumber]));

  const vocabById = new Map(vocabRows.map((v) => [v.id, v]));
  const grammarById = new Map(grammarRows.map((g) => [g.id, g]));

  const [counts] = await db
    .select({
      attemptCount: sql<number>`count(*)::int`,
      submittedCount: sql<number>`count(*) filter (where ${attempts.state} = 'submitted')::int`,
    })
    .from(attempts)
    .where(eq(attempts.testId, testId));

  return {
    id: row.test.id,
    title: row.test.title,
    status: row.test.status,
    weekNumber: row.plan.weekNumber,
    weekKey: row.plan.weekKey,
    startsOn: row.plan.startsOn,
    endsOn: row.plan.endsOn,
    timeLimitMinutes: row.test.timeLimitMinutes,
    passageKo: row.test.passageKo,
    passageEn: row.test.passageEn,
    spec: row.test.spec,
    approvedAt: row.test.approvedAt,
    createdAt: row.test.createdAt,
    attemptCount: counts?.attemptCount ?? 0,
    submittedCount: counts?.submittedCount ?? 0,
    questions: qs.map((q) => {
      const v = q.vocabId ? vocabById.get(q.vocabId) : undefined;
      const g = q.grammarId ? grammarById.get(q.grammarId) : undefined;
      return {
        id: q.id,
        position: q.position,
        section: q.section,
        format: q.format,
        prompt: q.prompt,
        choices: q.choices,
        correctAnswer: q.correctAnswer,
        acceptedAnswers: q.acceptedAnswers,
        link: v
          ? {
              kind: "vocab" as const,
              id: v.id,
              korean: v.korean,
              english: v.english,
              assignedWeek: assignedWeek.get(v.id) ?? null,
            }
          : g
            ? {
                kind: "grammar" as const,
                id: g.id,
                form: g.form,
                name: g.name,
                meaning: g.meaning,
              }
            : null,
      };
    }),
  };
}

/**
 * Every test a student can look back on, newest week first.
 *
 * Drafts and tests in review are absent: a student has no business seeing a
 * test before the teacher has published it. A published test they never sat
 * still appears, because "you did not sit this" is part of their history.
 */
export async function studentTestHistory(studentId: string) {
  const rows = await db
    .select({
      id: tests.id,
      title: tests.title,
      status: tests.status,
      weekNumber: weekPlans.weekNumber,
      endsOn: weekPlans.endsOn,
      questionCount: sql<number>`(select count(*) from ${questions} q where q.test_id = ${tests.id})::int`,
      attemptId: attempts.id,
      state: attempts.state,
      score: attempts.score,
      maxScore: attempts.maxScore,
      submittedAt: attempts.submittedAt,
    })
    .from(tests)
    .innerJoin(weekPlans, eq(weekPlans.id, tests.weekPlanId))
    // The student's own latest attempt, if any. A left join keeps tests they
    // never sat in the list rather than silently dropping them.
    .leftJoin(
      attempts,
      and(
        eq(attempts.testId, tests.id),
        eq(attempts.studentId, studentId),
        sql`${attempts.attemptNumber} = (
          select max(a2.attempt_number) from attempts a2
          where a2.test_id = ${tests.id} and a2.student_id = ${studentId}
        )`,
      ),
    )
    .where(inArray(tests.status, ["published", "closed"]))
    .orderBy(desc(weekPlans.weekNumber));
  return rows;
}

export async function setTestStatus(
  testId: string,
  status: TestStatus,
  approvedBy?: string,
) {
  await db
    .update(tests)
    .set({
      status,
      // Publishing stamps who approved it and opens the window. Closing shuts
      // the window, which is what stops a student sitting a stale week later
      // with the answers already in front of them.
      ...(status === "published"
        ? {
            opensAt: new Date(),
            closesAt: null,
            ...(approvedBy ? { approvedBy, approvedAt: new Date() } : {}),
          }
        : {}),
      ...(status === "closed" ? { closesAt: new Date() } : {}),
    })
    .where(eq(tests.id, testId));
}

/** Removes a test and everything under it. Only safe while nobody has sat it. */
export async function deleteTest(testId: string): Promise<void> {
  await db.delete(tests).where(eq(tests.id, testId));
}

/** Used by the checks to clear imported tests between runs. */
export async function deleteTestsForWeeks(weekNumbers: number[]) {
  if (weekNumbers.length === 0) return;
  const plans = await db
    .select({ id: weekPlans.id })
    .from(weekPlans)
    .where(inArray(weekPlans.weekNumber, weekNumbers));
  if (plans.length === 0) return;
  await db.delete(tests).where(
    inArray(
      tests.weekPlanId,
      plans.map((p) => p.id),
    ),
  );
}

import "server-only";

import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  attempts,
  corpusVocab,
  practiceResponses,
  practiceRuns,
  responses,
  tests,
  weekPlanGrammar,
  weekPlanVocab,
  weekPlans,
} from "@/db/schema";

/**
 * Everything a student's own dashboard shows, in one pass.
 *
 * The teacher screens ask the same questions across the whole cohort and can
 * afford a query per figure; a student asks them about one person, on the page
 * they land on, so they are gathered here instead of assembled from four
 * modules at the call site.
 *
 * The two vocabulary numbers stay separate for the same reason they do on the
 * teacher side. `studied` is self-directed and soft — got it right first time
 * in practice at least once — and is what the semester goal is measured
 * against. `verified` is proctored and much smaller. Showing only one of them
 * would either flatter the student or bury how much work they have done.
 */

export type WeekProgress = {
  weekNumber: number;
  /** Words assigned this week, and how many are studied so far. */
  assigned: number;
  studied: number;
  /** Per study day, so the page can show which days are still untouched. */
  days: { day: number; assigned: number; studied: number }[];
};

export type StudentDashboard = {
  bankWords: number;
  bankGrammar: number;
  studied: number;
  verified: number;
  grammarStudied: number;
  practiceRuns: number;
  lastPracticeAt: Date | null;
  week: WeekProgress;
  lastTest: {
    testId: string;
    title: string;
    weekNumber: number;
    score: number;
    maxScore: number;
    submittedAt: Date | null;
    /** Words on that test the student got wrong — the obvious thing to revisit. */
    missed: { korean: string; english: string }[];
  } | null;
  /** A published test for a week they have not sat. The one thing with a deadline. */
  openTest: {
    testId: string;
    title: string;
    weekNumber: number;
    questionCount: number;
    timeLimitMinutes: number;
    inProgress: boolean;
  } | null;
};

export async function studentDashboard(
  studentId: string,
  week: number,
): Promise<StudentDashboard> {
  // --- the bank, and what has been got right in practice ----------------
  const [bank] = await db
    .select({
      words: sql<number>`count(*)::int`,
      studied: sql<number>`count(*) filter (where exists (
        select 1 from practice_responses pr
        where pr.vocab_id = ${weekPlanVocab.vocabId}
          and pr.student_id = ${studentId}
          and pr.first_try and pr.is_correct
      ))::int`,
    })
    .from(weekPlanVocab)
    .innerJoin(weekPlans, eq(weekPlans.id, weekPlanVocab.weekPlanId))
    .innerJoin(corpusVocab, eq(corpusVocab.id, weekPlanVocab.vocabId))
    .where(and(lte(weekPlans.weekNumber, week), eq(corpusVocab.retired, false)));

  const [grammarCounts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      studied: sql<number>`count(*) filter (where exists (
        select 1 from practice_responses pr
        where pr.grammar_id = ${weekPlanGrammar.grammarId}
          and pr.student_id = ${studentId}
          and pr.first_try and pr.is_correct
      ))::int`,
    })
    .from(weekPlanGrammar)
    .innerJoin(weekPlans, eq(weekPlans.id, weekPlanGrammar.weekPlanId))
    .where(lte(weekPlans.weekNumber, week));

  // Verified: correct on two distinct tests with the most recent correct.
  // Written out rather than reusing mastery.ts so the whole dashboard is one
  // round of queries rather than a full per-word fetch the page then counts.
  const [verifiedRow] = await db
    .select({
      n: sql<number>`(
        select count(*) from (
          select r.vocab_id
          from responses r
          join questions q on q.id = r.question_id
          where r.student_id = ${studentId}
            and r.vocab_id is not null
            and r.needs_review = false
          group by r.vocab_id
          having count(distinct case when r.is_correct then q.test_id end) >= 2
             and coalesce((array_agg(r.is_correct order by r.answered_at desc))[1], false)
        ) m
      )::int`,
    })
    .from(weekPlans)
    .limit(1);

  // --- this week, by study day ------------------------------------------
  const weekRows = await db
    .select({
      studyDay: weekPlanVocab.studyDay,
      assigned: sql<number>`count(*)::int`,
      studied: sql<number>`count(*) filter (where exists (
        select 1 from practice_responses pr
        where pr.vocab_id = ${weekPlanVocab.vocabId}
          and pr.student_id = ${studentId}
          and pr.first_try and pr.is_correct
      ))::int`,
    })
    .from(weekPlanVocab)
    .innerJoin(weekPlans, eq(weekPlans.id, weekPlanVocab.weekPlanId))
    .where(eq(weekPlans.weekNumber, week))
    .groupBy(weekPlanVocab.studyDay)
    .orderBy(asc(weekPlanVocab.studyDay));

  // --- practice history --------------------------------------------------
  const [practice] = await db
    .select({
      runs: sql<number>`count(*)::int`,
      // Raw max() comes back as a string, not a Date, unlike a selected column.
      lastAt: sql<string | null>`max(${practiceRuns.ranAt})`,
    })
    .from(practiceRuns)
    .where(eq(practiceRuns.studentId, studentId));

  // --- the last test sat --------------------------------------------------
  const [last] = await db
    .select({
      attemptId: attempts.id,
      testId: tests.id,
      title: tests.title,
      weekNumber: weekPlans.weekNumber,
      score: attempts.score,
      maxScore: attempts.maxScore,
      submittedAt: attempts.submittedAt,
    })
    .from(attempts)
    .innerJoin(tests, eq(tests.id, attempts.testId))
    .innerJoin(weekPlans, eq(weekPlans.id, tests.weekPlanId))
    .where(and(eq(attempts.studentId, studentId), eq(attempts.state, "submitted")))
    .orderBy(desc(attempts.submittedAt))
    .limit(1);

  const missed = last
    ? await db
        .select({ korean: corpusVocab.korean, english: corpusVocab.english })
        .from(responses)
        .innerJoin(corpusVocab, eq(corpusVocab.id, responses.vocabId))
        .where(
          and(
            eq(responses.attemptId, last.attemptId),
            eq(responses.isCorrect, false),
          ),
        )
        .limit(8)
    : [];

  // --- anything open ------------------------------------------------------
  //
  // A published test they have not submitted. Resuming an abandoned attempt is
  // the same door, so an in-progress one counts as open and says so.
  const [open] = await db
    .select({
      testId: tests.id,
      title: tests.title,
      weekNumber: weekPlans.weekNumber,
      timeLimitMinutes: tests.timeLimitMinutes,
      questionCount: sql<number>`(select count(*) from questions q where q.test_id = ${tests.id})::int`,
      inProgress: sql<boolean>`exists (
        select 1 from attempts a
        where a.test_id = ${tests.id} and a.student_id = ${studentId}
          and a.state = 'in_progress'
      )`,
    })
    .from(tests)
    .innerJoin(weekPlans, eq(weekPlans.id, tests.weekPlanId))
    .where(
      and(
        eq(tests.status, "published"),
        sql`not exists (
          select 1 from attempts a
          where a.test_id = ${tests.id} and a.student_id = ${studentId}
            and a.state = 'submitted'
        )`,
      ),
    )
    .orderBy(desc(weekPlans.weekNumber))
    .limit(1);

  return {
    bankWords: bank?.words ?? 0,
    bankGrammar: grammarCounts?.total ?? 0,
    studied: bank?.studied ?? 0,
    verified: verifiedRow?.n ?? 0,
    grammarStudied: grammarCounts?.studied ?? 0,
    practiceRuns: practice?.runs ?? 0,
    lastPracticeAt: practice?.lastAt ? new Date(practice.lastAt) : null,
    week: {
      weekNumber: week,
      assigned: weekRows.reduce((n, r) => n + r.assigned, 0),
      studied: weekRows.reduce((n, r) => n + r.studied, 0),
      days: weekRows.map((r) => ({
        day: r.studyDay,
        assigned: r.assigned,
        studied: r.studied,
      })),
    },
    lastTest: last
      ? {
          testId: last.testId,
          title: last.title,
          weekNumber: last.weekNumber,
          score: last.score ?? 0,
          maxScore: last.maxScore ?? 0,
          submittedAt: last.submittedAt,
          missed,
        }
      : null,
    openTest: open ?? null,
  };
}

/**
 * Which words and patterns this student has got right first time in practice.
 *
 * The page this feeds marks them in the list. The bank it is modelled on has
 * the learner tick words off by hand; here the app already knows, from the
 * drill, and a mark the student cannot fake is worth more than one they can.
 */
export async function studiedIds(studentId: string): Promise<{
  vocab: Set<string>;
  grammar: Set<string>;
}> {
  const rows = await db
    .select({
      vocabId: practiceResponses.vocabId,
      grammarId: practiceResponses.grammarId,
    })
    .from(practiceResponses)
    .where(
      and(
        eq(practiceResponses.studentId, studentId),
        eq(practiceResponses.firstTry, true),
        eq(practiceResponses.isCorrect, true),
      ),
    );

  const vocab = new Set<string>();
  const grammar = new Set<string>();
  for (const r of rows) {
    if (r.vocabId) vocab.add(r.vocabId);
    if (r.grammarId) grammar.add(r.grammarId);
  }
  return { vocab, grammar };
}

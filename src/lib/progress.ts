import "server-only";

import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  attempts,
  corpusGrammar,
  corpusVocab,
  questions,
  practiceResponses,
  practiceRuns as practiceRunsTable,
  responses,
  teamMembers,
  teams,
  tests,
  users,
  weekPlans,
} from "@/db/schema";
import { MASTERY_CORRECT_TESTS } from "./mastery";

/*
 * Explicitly qualified. A bare ${users.id} renders unqualified when only one
 * table is in scope, and Postgres then binds it to the subquery table instead
 * of the outer row — silently returning zero. These queries happen to join, so
 * drizzle qualifies today; this makes the correctness deliberate.
 */
const USER_ID = sql.raw('"users"."id"');

/**
 * Cohort and per-student progress for the teacher screens.
 *
 * Mastery is defined once, in SQL, and reused: correct on at least
 * MASTERY_CORRECT_TESTS distinct tests with the most recent answer correct.
 */

const masteredVocab = sql`
  select r.student_id, r.vocab_id
  from ${responses} r
  join ${questions} q on q.id = r.question_id
  where r.vocab_id is not null and r.needs_review = false
  group by r.student_id, r.vocab_id
  having count(distinct case when r.is_correct then q.test_id end) >= ${MASTERY_CORRECT_TESTS}
     and coalesce((array_agg(r.is_correct order by r.answered_at desc))[1], false)
`;

/**
 * Two vocabulary numbers, deliberately separate.
 *
 * `vocabStudied` is the soft one: words the student has got right first time
 * in self-directed practice at least once. It tracks the semester goal, since
 * a weekly test can only ask about ~20 words while 125 are assigned.
 *
 * `vocabVerified` is the hard one: correct on two distinct tests with the most
 * recent answer correct. It is proctored and much smaller, and it is what the
 * retention figure is built on.
 *
 * Reporting only the first would flatter; only the second would make a 1,500
 * word goal unreachable by roughly ten times.
 */
export type StudentProgress = {
  id: string;
  displayName: string;
  teamName: string | null;
  taName: string | null;
  vocabStudied: number;
  vocabVerified: number;
  grammarStudied: number;
  grammarVerified: number;
  /** Distinct words the student has been tested on at all. */
  vocabSeen: number;
  practiceRuns: number;
  testsTaken: number;
  lastScore: number | null;
  lastMaxScore: number | null;
  lastTestWeek: number | null;
  /** Accuracy on words that had already appeared on an earlier test. */
  retentionRate: number | null;
};

export async function cohortProgress(): Promise<StudentProgress[]> {
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      teamName: teams.name,
      taName: sql<string | null>`(select display_name from ${users} u2 where u2.id = ${teams.taId})`,
      vocabVerified: sql<number>`(select count(*) from (${masteredVocab}) m where m.student_id = ${USER_ID})::int`,
      /* Studied = got it right first time in practice at least once. */
      vocabStudied: sql<number>`(
        select count(distinct pr.vocab_id) from ${practiceResponses} pr
        where pr.student_id = ${USER_ID}
          and pr.vocab_id is not null
          and pr.first_try and pr.is_correct
      )::int`,
      grammarStudied: sql<number>`(
        select count(distinct pr.grammar_id) from ${practiceResponses} pr
        where pr.student_id = ${USER_ID}
          and pr.grammar_id is not null
          and pr.first_try and pr.is_correct
      )::int`,
      practiceRuns: sql<number>`(
        select count(*) from ${practiceRunsTable} p where p.student_id = ${USER_ID}
      )::int`,
      vocabSeen: sql<number>`(
        select count(distinct r.vocab_id) from ${responses} r
        where r.student_id = ${USER_ID} and r.vocab_id is not null
      )::int`,
      grammarVerified: sql<number>`(
        select count(*) from (
          select r.grammar_id
          from ${responses} r
          join ${questions} q on q.id = r.question_id
          where r.student_id = ${USER_ID} and r.grammar_id is not null and r.needs_review = false
          group by r.grammar_id
          having count(distinct case when r.is_correct then q.test_id end) >= ${MASTERY_CORRECT_TESTS}
             and coalesce((array_agg(r.is_correct order by r.answered_at desc))[1], false)
        ) g
      )::int`,
      testsTaken: sql<number>`(
        select count(*) from ${attempts} a
        where a.student_id = ${USER_ID} and a.state = 'submitted'
      )::int`,
      lastScore: sql<number | null>`(
        select a.score from ${attempts} a
        where a.student_id = ${USER_ID} and a.state = 'submitted'
        order by a.submitted_at desc limit 1
      )`,
      lastMaxScore: sql<number | null>`(
        select a.max_score from ${attempts} a
        where a.student_id = ${USER_ID} and a.state = 'submitted'
        order by a.submitted_at desc limit 1
      )`,
      lastTestWeek: sql<number | null>`(
        select wp.week_number from ${attempts} a
        join ${tests} t on t.id = a.test_id
        join ${weekPlans} wp on wp.id = t.week_plan_id
        where a.student_id = ${USER_ID} and a.state = 'submitted'
        order by a.submitted_at desc limit 1
      )`,
      /*
       * Retention: accuracy only on words the student had already been tested
       * on before. This is the number that separates learning from cramming —
       * overall score can stay high while retention collapses.
       */
      retentionRate: sql<number | null>`(
        select round(avg(case when r.is_correct then 1.0 else 0.0 end) * 100)::int
        from ${responses} r
        join ${questions} q on q.id = r.question_id
        where r.student_id = ${USER_ID}
          and r.vocab_id is not null
          and exists (
            select 1 from ${responses} r2
            join ${questions} q2 on q2.id = r2.question_id
            where r2.student_id = r.student_id
              and r2.vocab_id = r.vocab_id
              and q2.test_id <> q.test_id
              and r2.answered_at < r.answered_at
          )
      )`,
    })
    .from(users)
    .leftJoin(teamMembers, eq(teamMembers.studentId, users.id))
    .leftJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(sql`'student' = any(${users.roles})`)
    .orderBy(asc(users.displayName));

  return rows;
}

export type TestResult = {
  testId: string;
  title: string;
  weekNumber: number;
  score: number | null;
  maxScore: number | null;
  submittedAt: Date | null;
};

export type MissedWord = {
  vocabId: string;
  korean: string;
  english: string;
  partOfSpeech: string | null;
  timesSeen: number;
  timesCorrect: number;
};

export type PosAccuracy = {
  partOfSpeech: string | null;
  asked: number;
  correct: number;
};

export async function studentDetail(studentId: string) {
  const [student] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      teamName: teams.name,
      taName: sql<string | null>`(select display_name from ${users} u2 where u2.id = ${teams.taId})`,
    })
    .from(users)
    .leftJoin(teamMembers, eq(teamMembers.studentId, users.id))
    .leftJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(users.id, studentId))
    .limit(1);

  if (!student) return null;

  const history: TestResult[] = await db
    .select({
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
    .where(eq(attempts.studentId, studentId))
    .orderBy(asc(weekPlans.weekNumber));

  const missed: MissedWord[] = await db
    .select({
      vocabId: corpusVocab.id,
      korean: corpusVocab.korean,
      english: corpusVocab.english,
      partOfSpeech: corpusVocab.partOfSpeech,
      timesSeen: sql<number>`count(*)::int`,
      timesCorrect: sql<number>`count(*) filter (where ${responses.isCorrect})::int`,
    })
    .from(responses)
    .innerJoin(corpusVocab, eq(corpusVocab.id, responses.vocabId))
    .where(eq(responses.studentId, studentId))
    .groupBy(corpusVocab.id, corpusVocab.korean, corpusVocab.english, corpusVocab.partOfSpeech)
    .having(sql`count(*) filter (where ${responses.isCorrect}) < count(*)`)
    .orderBy(
      sql`count(*) filter (where ${responses.isCorrect})::float / count(*) asc`,
      desc(sql`count(*)`),
    )
    .limit(20);

  const byPos: PosAccuracy[] = await db
    .select({
      partOfSpeech: corpusVocab.partOfSpeech,
      asked: sql<number>`count(*)::int`,
      correct: sql<number>`count(*) filter (where ${responses.isCorrect})::int`,
    })
    .from(responses)
    .innerJoin(corpusVocab, eq(corpusVocab.id, responses.vocabId))
    .where(eq(responses.studentId, studentId))
    .groupBy(corpusVocab.partOfSpeech)
    .orderBy(sql`count(*) desc`);

  const grammarResults = await db
    .select({
      form: corpusGrammar.form,
      name: corpusGrammar.name,
      asked: sql<number>`count(*)::int`,
      correct: sql<number>`count(*) filter (where ${responses.isCorrect})::int`,
    })
    .from(responses)
    .innerJoin(corpusGrammar, eq(corpusGrammar.id, responses.grammarId))
    .where(eq(responses.studentId, studentId))
    .groupBy(corpusGrammar.form, corpusGrammar.name)
    .orderBy(asc(corpusGrammar.form));

  return { student, history, missed, byPos, grammarResults };
}

/** Where a student should be this week to finish the term on pace. */
export function paceTarget(goal: number, week: number, totalWeeks: number) {
  return Math.round((goal * Math.min(week, totalWeeks)) / totalWeeks);
}

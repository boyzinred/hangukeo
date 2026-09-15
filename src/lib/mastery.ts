import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { corpusVocab, questions, responses } from "@/db/schema";

/**
 * Mastery is test-score based: an item counts as mastered once the student has
 * answered it correctly on at least MASTERY_CORRECT_TESTS *distinct* tests and
 * their most recent answer for it was correct.
 *
 * Requiring two distinct tests stops a single lucky guess from inflating the
 * semester count; requiring the last answer to be correct means a student who
 * regresses loses the credit. Practice runs never feed this — they are logged
 * separately in `practice_runs`.
 */
export const MASTERY_CORRECT_TESTS = 2;

export type ItemProgress = {
  itemId: string;
  korean: string;
  english: string;
  correctTests: number;
  totalSeen: number;
  lastCorrect: boolean;
  mastered: boolean;
};

export async function vocabProgressForStudent(
  studentId: string,
): Promise<ItemProgress[]> {
  const rows = await db
    .select({
      itemId: corpusVocab.id,
      korean: corpusVocab.korean,
      english: corpusVocab.english,
      correctTests: sql<number>`count(distinct case when ${responses.isCorrect} then ${questions.testId} end)::int`,
      totalSeen: sql<number>`count(${responses.id})::int`,
      lastCorrect: sql<boolean>`coalesce((array_agg(${responses.isCorrect} order by ${responses.answeredAt} desc))[1], false)`,
    })
    .from(responses)
    .innerJoin(corpusVocab, eq(corpusVocab.id, responses.vocabId))
    .innerJoin(questions, eq(questions.id, responses.questionId))
    .where(
      and(
        eq(responses.studentId, studentId),
        eq(responses.needsReview, false),
        isNotNull(responses.vocabId),
      ),
    )
    .groupBy(corpusVocab.id, corpusVocab.korean, corpusVocab.english);

  return rows.map((r) => ({
    ...r,
    mastered: r.correctTests >= MASTERY_CORRECT_TESTS && r.lastCorrect,
  }));
}

export type ProgressSummary = {
  mastered: number;
  goal: number;
  /** Where the student should be this week to finish on pace. */
  paceTarget: number;
  onPace: boolean;
  weakItems: ItemProgress[];
};

export function summarise(
  progress: ItemProgress[],
  opts: { goal: number; weeksElapsed: number; totalWeeks: number },
): ProgressSummary {
  const mastered = progress.filter((p) => p.mastered).length;
  const paceTarget = Math.round(
    (opts.goal * Math.min(opts.weeksElapsed, opts.totalWeeks)) / opts.totalWeeks,
  );

  // Seen at least twice, still not mastered — the review list worth surfacing.
  const weakItems = progress
    .filter((p) => !p.mastered && p.totalSeen >= 2)
    .sort((a, b) => a.correctTests - b.correctTests || b.totalSeen - a.totalSeen)
    .slice(0, 10);

  return { mastered, goal: opts.goal, paceTarget, onPace: mastered >= paceTarget, weakItems };
}

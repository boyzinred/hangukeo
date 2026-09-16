import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  attempts,
  corpusVocab,
  questions,
  responses,
  tests,
  users,
  weekPlans,
} from "@/db/schema";
import { normalizeEnglish, normalizeKorean } from "./quiz";
import { gradeAttempt } from "./test-taking";

/**
 * The grading queue.
 *
 * When a student types an answer the grader cannot match, it is marked wrong
 * and flagged rather than failed silently — the alternative is losing a mark
 * over a synonym nobody thought to list. Every figure the teacher reads then
 * excludes that response (`progress.ts` and `mastery.ts` both filter
 * `needs_review = false`), so until a person looks at it the answer counts for
 * nothing at all. This is where a person looks at it.
 *
 * The unit of work is the *answer*, not the response. Nineteen students who
 * all wrote "good" for 좋다 are one decision, not nineteen, and on a
 * full-coverage test the difference is between a queue that empties and one
 * nobody opens twice. Answers are grouped by what the grader compares —
 * normalised — so spacing and case do not split a group.
 */

/** The same rule `grade()` uses, so the queue groups the way the grader compared. */
function normaliseFor(format: string, value: string): string {
  return format === "en_to_ko_typed"
    ? normalizeKorean(value)
    : normalizeEnglish(value);
}

export type FlaggedAnswer = {
  /** questionId + normalised answer — stable, and what the action takes back. */
  key: string;
  questionId: string;
  testId: string;
  testTitle: string;
  weekNumber: number;
  format: string;
  prompt: string;
  correctAnswer: string;
  acceptedAnswers: string[];
  /** The corpus word this question feeds, when it still has one. */
  vocabId: string | null;
  korean: string | null;
  /** Representative spelling, and every distinct one that normalised to it. */
  answer: string;
  spellings: string[];
  students: { id: string; displayName: string }[];
  /**
   * True when accepting this can be written back to the corpus. Only English
   * answers can: `corpus_vocab.accepted_answers` holds English alternates, and
   * there is no column for Korean variants, so an accepted Korean spelling
   * resolves these responses and nothing more.
   */
  canTeachGrader: boolean;
};

export async function flaggedQueue(testId?: string): Promise<FlaggedAnswer[]> {
  const rows = await db
    .select({
      responseId: responses.id,
      answer: responses.answer,
      questionId: questions.id,
      format: questions.format,
      prompt: questions.prompt,
      correctAnswer: questions.correctAnswer,
      acceptedAnswers: questions.acceptedAnswers,
      vocabId: questions.vocabId,
      korean: corpusVocab.korean,
      testId: tests.id,
      testTitle: tests.title,
      weekNumber: weekPlans.weekNumber,
      studentId: users.id,
      displayName: users.displayName,
    })
    .from(responses)
    .innerJoin(questions, eq(questions.id, responses.questionId))
    .innerJoin(tests, eq(tests.id, questions.testId))
    .innerJoin(weekPlans, eq(weekPlans.id, tests.weekPlanId))
    .innerJoin(users, eq(users.id, responses.studentId))
    .leftJoin(corpusVocab, eq(corpusVocab.id, questions.vocabId))
    .where(
      testId
        ? and(eq(responses.needsReview, true), eq(tests.id, testId))
        : eq(responses.needsReview, true),
    )
    .orderBy(asc(weekPlans.weekNumber), asc(questions.position));

  const groups = new Map<string, FlaggedAnswer>();

  for (const r of rows) {
    const written = r.answer ?? "";
    const key = `${r.questionId}::${normaliseFor(r.format, written)}`;

    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        questionId: r.questionId,
        testId: r.testId,
        testTitle: r.testTitle,
        weekNumber: r.weekNumber,
        format: r.format,
        prompt: r.prompt,
        correctAnswer: r.correctAnswer,
        acceptedAnswers: r.acceptedAnswers,
        vocabId: r.vocabId,
        korean: r.korean,
        answer: written,
        spellings: [],
        students: [],
        canTeachGrader: r.format === "ko_to_en_typed" && r.vocabId !== null,
      };
      groups.set(key, g);
    }
    if (!g.spellings.includes(written)) g.spellings.push(written);
    if (!g.students.some((s) => s.id === r.studentId)) {
      g.students.push({ id: r.studentId, displayName: r.displayName });
    }
  }

  // Most-given answers first: that is where one decision clears the most work,
  // and a spelling many students reached independently is the one most likely
  // to be a real synonym rather than a mistake.
  return [...groups.values()].sort(
    (a, b) => b.students.length - a.students.length,
  );
}

export type ResolveResult = {
  resolved: number;
  rescored: number;
  /** The spelling written back to the corpus, if any. */
  taught: string | null;
};

/**
 * Settles one answer for every student who gave it.
 *
 * Accepting with `teachGrader` writes the spelling into the word's accepted
 * answers, so the same synonym is never asked about again — in this test and
 * in every future one. That is the difference between draining the queue and
 * re-filling it next week.
 */
export async function resolveFlag(input: {
  questionId: string;
  /** Any spelling from the group; matching is done on the normalised form. */
  answer: string;
  accept: boolean;
  teachGrader: boolean;
}): Promise<ResolveResult> {
  const [q] = await db
    .select()
    .from(questions)
    .where(eq(questions.id, input.questionId));
  if (!q) throw new Error("No such question.");

  const target = normaliseFor(q.format, input.answer);

  const flagged = await db
    .select()
    .from(responses)
    .where(
      and(eq(responses.questionId, q.id), eq(responses.needsReview, true)),
    );
  const hits = flagged.filter(
    (r) => normaliseFor(q.format, r.answer ?? "") === target,
  );
  if (hits.length === 0) return { resolved: 0, rescored: 0, taught: null };

  await db
    .update(responses)
    .set({ isCorrect: input.accept, needsReview: false })
    .where(
      inArray(
        responses.id,
        hits.map((r) => r.id),
      ),
    );

  let taught: string | null = null;
  const canTeach = input.accept && input.teachGrader && q.vocabId && q.format === "ko_to_en_typed";
  if (canTeach) {
    const spelling = input.answer.trim();
    const [word] = await db
      .select()
      .from(corpusVocab)
      .where(eq(corpusVocab.id, q.vocabId!));

    const known = [word.english, ...word.acceptedAnswers];
    if (!known.some((a) => normalizeEnglish(a) === target)) {
      await db
        .update(corpusVocab)
        .set({ acceptedAnswers: [...word.acceptedAnswers, spelling] })
        .where(eq(corpusVocab.id, q.vocabId!));
      taught = spelling;
    }

    // Also on the question itself, so this test's own record agrees with the
    // decision rather than still asserting the spelling was unacceptable.
    if (!q.acceptedAnswers.some((a) => normalizeEnglish(a) === target)) {
      await db
        .update(questions)
        .set({ acceptedAnswers: [...q.acceptedAnswers, spelling] })
        .where(eq(questions.id, q.id));
    }
  }

  // Scores are stored, not derived, so every touched attempt has to be totalled
  // again or the student keeps seeing the mark they had before the decision.
  const attemptIds = [...new Set(hits.map((r) => r.attemptId))];
  for (const id of attemptIds) await gradeAttempt(id);

  return { resolved: hits.length, rescored: attemptIds.length, taught };
}

/** How much is waiting, for the badge on the tests list. */
export async function flaggedTotal(): Promise<number> {
  const rows = await db
    .select({ id: responses.id })
    .from(responses)
    .where(eq(responses.needsReview, true));
  return rows.length;
}

/** One test, named — for the queue's heading when it is filtered to a test
 * that has nothing waiting and so is absent from `testsWithFlags`. */
export async function namedTest(testId: string) {
  const [row] = await db
    .select({
      id: tests.id,
      title: tests.title,
      weekNumber: weekPlans.weekNumber,
    })
    .from(tests)
    .innerJoin(weekPlans, eq(weekPlans.id, tests.weekPlanId))
    .where(eq(tests.id, testId))
    .limit(1);
  return row ?? null;
}

/** Tests that have something waiting, for the queue's filter. */
export async function testsWithFlags() {
  const rows = await db
    .select({
      id: tests.id,
      title: tests.title,
      weekNumber: weekPlans.weekNumber,
    })
    .from(responses)
    .innerJoin(questions, eq(questions.id, responses.questionId))
    .innerJoin(tests, eq(tests.id, questions.testId))
    .innerJoin(weekPlans, eq(weekPlans.id, tests.weekPlanId))
    .innerJoin(attempts, eq(attempts.id, responses.attemptId))
    .where(eq(responses.needsReview, true))
    .groupBy(tests.id, tests.title, weekPlans.weekNumber)
    .orderBy(asc(weekPlans.weekNumber));
  return rows;
}

import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { attempts, questions, responses, tests } from "@/db/schema";
import { normalizeEnglish, normalizeKorean } from "./quiz";

/**
 * Sitting a test.
 *
 * The clock is server-owned. `attempts.expires_at` is written when the attempt
 * starts and every save and the submit are checked against it, so a refresh,
 * a second tab, or an edited client clock cannot buy more time. The countdown
 * in the browser is a display of that value, never the authority.
 *
 * Answers are saved as they are given rather than at the end, so a crashed
 * browser loses nothing and the attempt resumes from real data.
 *
 * These functions take a studentId and check no permissions; the server
 * actions establish who the student is first.
 */

export type ActiveQuestion = {
  id: string;
  kind: "vocab" | "grammar";
  format: string;
  section: string;
  position: number;
  prompt: string;
  choices: string[] | null;
  /** Never sent to the browser while the attempt is open. */
  answer?: string;
};

export type ActiveAttempt = {
  attemptId: string;
  testId: string;
  title: string;
  attemptNumber: number;
  /**
   * The Korean reading passage, when the test has one. Reading questions are
   * unanswerable without it, so it travels with the attempt rather than being
   * fetched separately. The English translation stays on the server: it is the
   * teacher's gloss, and sending it would hand over the answers.
   */
  passage: string | null;
  /** Server time when this attempt dies, ISO. */
  expiresAt: string;
  secondsRemaining: number;
  questions: ActiveQuestion[];
  /** questionId -> answer, for resuming. */
  saved: Record<string, string>;
};

export class TestError extends Error {}

function secondsLeft(expiresAt: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
}

/**
 * Starts a new attempt, or returns the one already in progress.
 *
 * A retake is automatic only when the previous attempt was never submitted —
 * a crash or a timeout. Anything else needs a TA to grant it, which is
 * recorded on the attempt.
 */
export async function startOrResume(
  studentId: string,
  testId: string,
): Promise<ActiveAttempt> {
  const [test] = await db.select().from(tests).where(eq(tests.id, testId));
  if (!test) throw new TestError("That test does not exist.");
  if (test.status !== "published") {
    throw new TestError("That test is not open yet.");
  }
  if (test.closesAt && test.closesAt.getTime() < Date.now()) {
    throw new TestError("That test has closed.");
  }

  const prior = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.testId, testId), eq(attempts.studentId, studentId)))
    .orderBy(desc(attempts.attemptNumber));

  const open = prior.find((a) => a.state === "in_progress");
  let attempt = open;

  if (open && secondsLeft(open.expiresAt) === 0) {
    // Ran out while away. Close it so it counts, rather than leaving a
    // zombie attempt that blocks everything.
    await db
      .update(attempts)
      .set({ state: "submitted", submittedAt: new Date() })
      .where(eq(attempts.id, open.id));
    await gradeAttempt(open.id);
    throw new TestError(
      "Your time ran out and the attempt was submitted. Ask your teacher for a retake.",
    );
  }

  if (!attempt) {
    const submitted = prior.filter((a) => a.state === "submitted");
    if (submitted.length > 0) {
      const granted = prior.some(
        (a) => a.attemptNumber > 1 && a.retakeGrantedBy !== null,
      );
      const nextNumber = Math.max(...prior.map((a) => a.attemptNumber)) + 1;
      const allowed = prior.some(
        (a) => a.attemptNumber === nextNumber && a.retakeGrantedBy !== null,
      );
      if (!granted && !allowed) {
        throw new TestError("You have already sat this test.");
      }
    }

    const count = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.testId, testId));

    const expiresAt = new Date(Date.now() + test.timeLimitMinutes * 60_000);
    [attempt] = await db
      .insert(attempts)
      .values({
        testId,
        studentId,
        attemptNumber: prior.length + 1,
        state: "in_progress",
        expiresAt,
        maxScore: count.length,
      })
      .returning();
  }

  const qs = await db
    .select()
    .from(questions)
    .where(eq(questions.testId, testId))
    .orderBy(asc(questions.position));

  const savedRows = await db
    .select()
    .from(responses)
    .where(eq(responses.attemptId, attempt.id));

  return {
    attemptId: attempt.id,
    testId,
    title: test.title,
    attemptNumber: attempt.attemptNumber,
    passage: test.passageKo,
    expiresAt: attempt.expiresAt.toISOString(),
    secondsRemaining: secondsLeft(attempt.expiresAt),
    // correctAnswer is deliberately absent: it must not reach the browser
    // while the attempt is open.
    questions: qs.map((q) => ({
      id: q.id,
      kind: q.kind,
      format: q.format,
      section: q.section,
      position: q.position,
      prompt: q.prompt,
      choices: q.choices,
    })),
    saved: Object.fromEntries(
      savedRows.map((r) => [r.questionId, r.answer ?? ""]),
    ),
  };
}

/** Saves one answer. Graded now, so a crash cannot lose the outcome. */
export async function saveAnswer(
  studentId: string,
  attemptId: string,
  questionId: string,
  answer: string,
): Promise<{ saved: boolean; secondsRemaining: number }> {
  const [attempt] = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.id, attemptId), eq(attempts.studentId, studentId)));
  if (!attempt) throw new TestError("No such attempt.");
  if (attempt.state !== "in_progress") {
    throw new TestError("That attempt is already submitted.");
  }

  const remaining = secondsLeft(attempt.expiresAt);
  if (remaining === 0) {
    // The client's countdown may disagree; the server's is the one that counts.
    return { saved: false, secondsRemaining: 0 };
  }

  const [q] = await db
    .select()
    .from(questions)
    .where(and(eq(questions.id, questionId), eq(questions.testId, attempt.testId)));
  if (!q) throw new TestError("That question is not on this test.");

  const { isCorrect, needsReview } = grade(q, answer);

  await db
    .insert(responses)
    .values({
      attemptId,
      questionId,
      studentId,
      vocabId: q.vocabId,
      grammarId: q.grammarId,
      answer,
      isCorrect,
      needsReview,
    })
    .onConflictDoUpdate({
      target: [responses.attemptId, responses.questionId],
      set: { answer, isCorrect, needsReview, answeredAt: new Date() },
    });

  return { saved: true, secondsRemaining: remaining };
}

/**
 * Grades one answer.
 *
 * Typed answers are compared after normalisation, against every accepted
 * spelling the corpus carries — so "good" passes for 좋다 even though the
 * canonical gloss is "to be good". A non-empty answer that matches nothing is
 * marked wrong but flagged for review, because the alternative is silently
 * failing a student over a synonym nobody thought to list.
 */
function grade(
  q: typeof questions.$inferSelect,
  answer: string,
): { isCorrect: boolean; needsReview: boolean } {
  const given = answer.trim();
  if (!given) return { isCorrect: false, needsReview: false };

  // Which language the *answer* is in, not which the prompt is. Getting this
  // backwards is not a near miss: normalizeEnglish strips everything outside
  // [a-z0-9], so a Korean answer normalises to the empty string and every
  // option matches every other one — the grader marks the whole question
  // correct whatever the student picked.
  const answerIsKorean =
    q.format === "en_to_ko_typed" || q.format === "en_to_ko_choice";
  const normalise = answerIsKorean ? normalizeKorean : normalizeEnglish;

  const accepted = [q.correctAnswer, ...q.acceptedAnswers];
  const hit = accepted.some((a) => normalise(a) === normalise(given));

  if (hit) return { isCorrect: true, needsReview: false };

  // Multiple choice has no ambiguity — a wrong option is simply wrong.
  if (q.choices && q.choices.length > 0) {
    return { isCorrect: false, needsReview: false };
  }

  return { isCorrect: false, needsReview: true };
}

export async function submitAttempt(
  studentId: string,
  attemptId: string,
): Promise<{ score: number; maxScore: number; needsReview: number }> {
  const [attempt] = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.id, attemptId), eq(attempts.studentId, studentId)));
  if (!attempt) throw new TestError("No such attempt.");
  if (attempt.state === "submitted") {
    return {
      score: attempt.score ?? 0,
      maxScore: attempt.maxScore ?? 0,
      needsReview: 0,
    };
  }

  await db
    .update(attempts)
    .set({ state: "submitted", submittedAt: new Date() })
    .where(eq(attempts.id, attemptId));

  return gradeAttempt(attemptId);
}

/** Totals an attempt from its saved responses. */
export async function gradeAttempt(attemptId: string) {
  const rows = await db
    .select()
    .from(responses)
    .where(eq(responses.attemptId, attemptId));

  const [attempt] = await db
    .select()
    .from(attempts)
    .where(eq(attempts.id, attemptId));

  const allQuestions = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.testId, attempt.testId));

  const score = rows.filter((r) => r.isCorrect).length;
  const needsReview = rows.filter((r) => r.needsReview).length;

  await db
    .update(attempts)
    .set({ score, maxScore: allQuestions.length })
    .where(eq(attempts.id, attemptId));

  return { score, maxScore: allQuestions.length, needsReview };
}

/** What the student sees after submitting. */
export async function attemptResult(studentId: string, attemptId: string) {
  const [attempt] = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.id, attemptId), eq(attempts.studentId, studentId)));
  if (!attempt) return null;

  const [test] = await db
    .select({ title: tests.title, passageKo: tests.passageKo })
    .from(tests)
    .where(eq(tests.id, attempt.testId));

  // Every question, not only the answered ones, and the options with them: a
  // student looking back at a multiple-choice test is asking what they were
  // offered and which one they took. A bare "correct answer" line says nothing
  // about the guess they nearly got right.
  const rows = await db
    .select({
      questionId: questions.id,
      prompt: questions.prompt,
      choices: questions.choices,
      given: responses.answer,
      correct: questions.correctAnswer,
      isCorrect: responses.isCorrect,
      needsReview: responses.needsReview,
      format: questions.format,
      section: questions.section,
      position: questions.position,
    })
    .from(questions)
    .leftJoin(
      responses,
      and(
        eq(responses.questionId, questions.id),
        eq(responses.attemptId, attemptId),
      ),
    )
    .where(eq(questions.testId, attempt.testId))
    .orderBy(asc(questions.position));

  return {
    testId: attempt.testId,
    title: test?.title ?? "",
    passage: test?.passageKo ?? null,
    score: attempt.score ?? 0,
    maxScore: attempt.maxScore ?? 0,
    submittedAt: attempt.submittedAt,
    answers: rows,
  };
}

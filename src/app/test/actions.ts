"use server";

import { requireStudent } from "@/lib/session";
import {
  saveAnswer,
  startOrResume,
  submitAttempt,
  TestError,
  type ActiveAttempt,
} from "@/lib/test-taking";

export type StartResult =
  | { ok: true; attempt: ActiveAttempt }
  | { ok: false; error: string };

/**
 * The student comes from the session, never the payload — a Server Action is
 * reachable by direct POST, so an attempt id alone must not be enough to write
 * answers into somebody else's sitting. Each function re-establishes identity
 * and the libs scope every query by it.
 */

export async function beginTest(testId: string): Promise<StartResult> {
  const me = await requireStudent();
  try {
    return { ok: true, attempt: await startOrResume(me.userId, testId) };
  } catch (e) {
    if (e instanceof TestError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function answer(input: {
  attemptId: string;
  questionId: string;
  answer: string;
}): Promise<{ saved: boolean; secondsRemaining: number; error?: string }> {
  const me = await requireStudent();
  try {
    return await saveAnswer(
      me.userId,
      input.attemptId,
      input.questionId,
      input.answer,
    );
  } catch (e) {
    if (e instanceof TestError) {
      return { saved: false, secondsRemaining: 0, error: e.message };
    }
    throw e;
  }
}

export async function finishTest(
  attemptId: string,
): Promise<
  { ok: true; score: number; maxScore: number } | { ok: false; error: string }
> {
  const me = await requireStudent();
  try {
    const { score, maxScore } = await submitAttempt(me.userId, attemptId);
    return { ok: true, score, maxScore };
  } catch (e) {
    if (e instanceof TestError) return { ok: false, error: e.message };
    throw e;
  }
}

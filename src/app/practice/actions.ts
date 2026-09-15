"use server";

import { requireStudent } from "@/lib/session";
import { recordPracticeRun, type PracticeOutcome } from "@/lib/practice";

export type { PracticeOutcome };

/**
 * Records a finished practice run.
 *
 * Server Actions are reachable by direct POST, so the student comes from the
 * session rather than the payload — a client cannot log practice for somebody
 * else. The write itself lives in lib/practice.ts.
 */
export async function savePracticeRun(input: {
  kind: "words" | "grammar";
  direction: string;
  scope: unknown;
  outcomes: PracticeOutcome[];
}): Promise<{ ok: boolean; saved: number }> {
  const me = await requireStudent();
  const { saved } = await recordPracticeRun(me.userId, input);
  return { ok: true, saved };
}

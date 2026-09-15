"use server";

import { db } from "@/db";
import { practiceResponses, practiceRuns } from "@/db/schema";
import { currentUser } from "@/lib/auth";

export type PracticeOutcome = {
  itemId: string;
  firstTry: boolean;
  isCorrect: boolean;
};

/**
 * Records a finished practice run.
 *
 * Server Actions are reachable by direct POST, so the student is taken from
 * the session rather than the payload — a client cannot log practice for
 * somebody else.
 */
export async function savePracticeRun(input: {
  kind: "words" | "grammar";
  direction: string;
  scope: unknown;
  outcomes: PracticeOutcome[];
}): Promise<{ ok: boolean; saved: number }> {
  const me = await currentUser();
  if (input.outcomes.length === 0) return { ok: true, saved: 0 };

  const kind = input.kind === "grammar" ? "grammar" : "vocab";
  const firstTryCorrect = input.outcomes.filter(
    (o) => o.firstTry && o.isCorrect,
  ).length;

  const [run] = await db
    .insert(practiceRuns)
    .values({
      studentId: me.userId,
      kind,
      direction: input.direction,
      total: input.outcomes.length,
      firstTryCorrect,
      scope: input.scope ?? null,
    })
    .returning();

  await db.insert(practiceResponses).values(
    input.outcomes.map((o) => ({
      runId: run.id,
      studentId: me.userId,
      vocabId: kind === "vocab" ? o.itemId : null,
      grammarId: kind === "grammar" ? o.itemId : null,
      firstTry: o.firstTry,
      isCorrect: o.isCorrect,
    })),
  );

  return { ok: true, saved: input.outcomes.length };
}

import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { practiceResponses, practiceRuns } from "@/db/schema";

export type PracticeOutcome = {
  itemId: string;
  firstTry: boolean;
  isCorrect: boolean;
};

/**
 * Writes a finished practice run.
 *
 * Takes `studentId` explicitly and performs no authorization: the caller is
 * responsible for establishing who the student is. The server action does that
 * from the session, which keeps this function testable outside a request.
 */
export async function recordPracticeRun(
  studentId: string,
  input: {
    kind: "words" | "grammar";
    direction: string;
    scope: unknown;
    outcomes: PracticeOutcome[];
  },
): Promise<{ runId: string | null; saved: number }> {
  if (input.outcomes.length === 0) return { runId: null, saved: 0 };

  const kind = input.kind === "grammar" ? "grammar" : "vocab";
  const firstTryCorrect = input.outcomes.filter(
    (o) => o.firstTry && o.isCorrect,
  ).length;

  const [run] = await db
    .insert(practiceRuns)
    .values({
      studentId,
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
      studentId,
      vocabId: kind === "vocab" ? o.itemId : null,
      grammarId: kind === "grammar" ? o.itemId : null,
      firstTry: o.firstTry,
      isCorrect: o.isCorrect,
    })),
  );

  return { runId: run.id, saved: input.outcomes.length };
}

/** Removes a run and its rows. Used by the check script to clean up. */
export async function deletePracticeRun(runId: string) {
  await db.delete(practiceResponses).where(eq(practiceResponses.runId, runId));
  await db.delete(practiceRuns).where(eq(practiceRuns.id, runId));
}

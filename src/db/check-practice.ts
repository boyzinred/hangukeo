/**
 * Exercises the practice-save path end to end against the real database,
 * standing in for a browser click-through. Run with `npm run check:practice`.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "./index";
import { corpusVocab, practiceResponses, practiceRuns } from "./schema";
import { savePracticeRun } from "../app/practice/actions";
import { currentUser } from "../lib/auth";

async function studiedCount(studentId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${practiceResponses.vocabId})::int` })
    .from(practiceResponses)
    .where(
      and(
        eq(practiceResponses.studentId, studentId),
        eq(practiceResponses.firstTry, true),
        eq(practiceResponses.isCorrect, true),
      ),
    );
  return row.n;
}

async function main() {
  const me = await currentUser();
  console.log(`acting as ${me.displayName}`);

  const before = await studiedCount(me.userId);

  // Three words the student has never practised, so the delta is unambiguous.
  const fresh = await db
    .select({ id: corpusVocab.id, korean: corpusVocab.korean })
    .from(corpusVocab)
    .where(
      sql`${corpusVocab.id} not in (
        select coalesce(vocab_id, '') from ${practiceResponses}
        where student_id = ${me.userId} and vocab_id is not null
      )`,
    )
    .limit(3);

  const res = await savePracticeRun({
    kind: "words",
    direction: "ko_to_en",
    scope: { check: true },
    outcomes: [
      { itemId: fresh[0].id, firstTry: true, isCorrect: true },
      { itemId: fresh[1].id, firstTry: false, isCorrect: true },
      { itemId: fresh[2].id, firstTry: false, isCorrect: false },
    ],
  });

  const after = await studiedCount(me.userId);
  const [run] = await db
    .select()
    .from(practiceRuns)
    .where(eq(practiceRuns.studentId, me.userId))
    .orderBy(sql`ran_at desc`)
    .limit(1);

  console.log(`saved ${res.saved} outcomes for ${fresh.map((f) => f.korean).join(", ")}`);
  console.log(`run: total=${run.total} firstTryCorrect=${run.firstTryCorrect}`);
  console.log(`studied: ${before} → ${after}`);

  const ok =
    res.saved === 3 &&
    run.total === 3 &&
    run.firstTryCorrect === 1 &&
    after === before + 1;

  // Only the first-try-correct word should raise "studied"; a retry-correct
  // and an outright miss must not.
  console.log(ok ? "\nPASS" : "\nFAIL — expected +1 studied, firstTryCorrect=1");

  await db.delete(practiceResponses).where(eq(practiceResponses.runId, run.id));
  await db.delete(practiceRuns).where(eq(practiceRuns.id, run.id));
  console.log("cleaned up");

  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

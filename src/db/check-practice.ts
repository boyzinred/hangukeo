/**
 * Exercises the practice-save path end to end against the real database,
 * standing in for a browser click-through. Run with `npm run check:practice`.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "./index";
import { corpusVocab, practiceResponses, practiceRuns, users } from "./schema";
import { deletePracticeRun, recordPracticeRun } from "../lib/practice";

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
  const [me] = await db
    .select()
    .from(users)
    .where(sql`'student' = any(${users.roles})`)
    .orderBy(users.createdAt)
    .limit(1);
  console.log(`acting as ${me.displayName}`);

  const before = await studiedCount(me.id);

  // Three words the student has never practised, so the delta is unambiguous.
  const fresh = await db
    .select({ id: corpusVocab.id, korean: corpusVocab.korean })
    .from(corpusVocab)
    .where(
      sql`${corpusVocab.id} not in (
        select coalesce(vocab_id, '') from ${practiceResponses}
        where student_id = ${me.id} and vocab_id is not null
      )`,
    )
    .limit(3);

  const res = await recordPracticeRun(me.id, {
    kind: "words",
    direction: "ko_to_en",
    scope: { check: true },
    outcomes: [
      { itemId: fresh[0].id, firstTry: true, isCorrect: true },
      { itemId: fresh[1].id, firstTry: false, isCorrect: true },
      { itemId: fresh[2].id, firstTry: false, isCorrect: false },
    ],
  });

  const after = await studiedCount(me.id);
  const [run] = await db
    .select()
    .from(practiceRuns)
    .where(eq(practiceRuns.studentId, me.id))
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

  await deletePracticeRun(run.id);
  console.log("cleaned up");

  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

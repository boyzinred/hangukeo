/**
 * Checks the grading queue: grouping, accepting, rejecting, the write-back to
 * the corpus, and — the part that is easy to get wrong — that a settled answer
 * changes the score the student already saw.
 *
 * Tests are multiple choice now, and a wrong option is simply wrong — so
 * nothing a current test produces can ever reach this queue. The fixture below
 * therefore imports a normal test and then turns two questions back into typed
 * ones directly in the database. That is the only way left to produce a
 * flagged answer, and it is honest about what the queue is for: responses that
 * predate the move to multiple choice, and anything typed that comes back.
 *
 * Builds its own test in week 1, sits it as two students with the same
 * unrecognised answer, and cleans up. Like `check:test` it clears week 1 at
 * both ends, so run `npm run db:seed:demo` afterwards to get the dashboard
 * populated again. Run with `npm run check:review`.
 */
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./index";
import {
  attempts,
  classSettings,
  corpusVocab,
  questions,
  responses,
  users,
  weekPlanVocab,
  weekPlans,
} from "./schema";
import {
  applyTestFile,
  CHOICE_COUNT,
  type WeekTestFile,
} from "../lib/test-import";
import { chooseDistractors, seeded, vocabOptionPool } from "../lib/distractors";
import { deleteTestsForWeeks, setTestStatus } from "../lib/tests";
import { flaggedQueue, flaggedTotal, resolveFlag } from "../lib/review";
import { saveAnswer, startOrResume, submitAttempt } from "../lib/test-taking";

let failures = 0;
function expect(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok    ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const WEEKS = [1];

/**
 * The accepted answer this check invents. Unique per run: accepting writes to
 * the corpus, and a fixed string left behind by a crashed run would be an
 * accepted answer on the next one — which silently removes the flag the whole
 * check depends on. That happened once; hence the run id.
 */
const NOVEL = `zzcheck${Date.now().toString().slice(-6)}`;

async function fixture(): Promise<WeekTestFile> {
  const [settings] = await db.select().from(classSettings).limit(1);

  const words = await db
    .select({ id: corpusVocab.id })
    .from(weekPlanVocab)
    .innerJoin(weekPlans, eq(weekPlans.id, weekPlanVocab.weekPlanId))
    .innerJoin(corpusVocab, eq(corpusVocab.id, weekPlanVocab.vocabId))
    .where(eq(weekPlans.weekNumber, 1))
    .orderBy(asc(corpusVocab.id))
    .limit(settings.testVocabCount);

  const pool = await vocabOptionPool(1);
  const rand = seeded(4242);

  return {
    weekNumber: 1,
    title: "Review check",
    questions: words.map((w) => ({
      kind: "vocab" as const,
      vocabId: w.id,
      // Korean prompt, so the answers are English and can be written back to
      // the corpus when accepted.
      format: "vocab_choice" as const,
      distractorIds: chooseDistractors(
        pool.find((c) => c.id === w.id)!,
        pool,
        "vocab_choice",
        CHOICE_COUNT - 1,
        rand,
      ).map((d) => d.id),
    })),
  };
}

async function main() {
  await deleteTestsForWeeks(WEEKS);

  const students = await db
    .select()
    .from(users)
    .where(sql`'student' = any(${users.roles})`)
    .orderBy(asc(users.displayName))
    .limit(2);

  const { testId } = await applyTestFile(await fixture());
  await setTestStatus(testId, "published");

  // Turn the first few back into typed questions: nothing the importer
  // produces can be flagged, so a flagged answer has to be manufactured.
  const all = await db
    .select()
    .from(questions)
    .where(eq(questions.testId, testId))
    .orderBy(asc(questions.position));
  await db
    .update(questions)
    .set({ format: "ko_to_en_typed", choices: null, distractorIds: null })
    .where(inArray(questions.id, all.slice(0, 4).map((q) => q.id)));

  const qs = await db
    .select()
    .from(questions)
    .where(eq(questions.testId, testId))
    .orderBy(asc(questions.position));
  const typed = qs.filter((q) => q.format === "ko_to_en_typed");
  const target = typed[0];
  const other = typed[1];
  const rejectMe = typed[2];

  // Accepting writes to the corpus, which outlives the test this check
  // deletes. Remember the word as it was so the bank is left untouched.
  const [wordBefore] = await db
    .select()
    .from(corpusVocab)
    .where(eq(corpusVocab.id, target.vocabId!));

  console.log("two students give the same unrecognised answer");
  for (const s of students) {
    const a = await startOrResume(s.id, testId);
    // Spacing and case differ between the two, which must not split the group.
    const spelling = s.id === students[0].id ? `${NOVEL} spelling` : `${NOVEL}  SPELLING`;
    await saveAnswer(s.id, a.attemptId, target.id, spelling);
    await saveAnswer(s.id, a.attemptId, other.id, "definitely-not-a-word");
    await saveAnswer(s.id, a.attemptId, rejectMe.id, "total nonsense here");
    // One real mark each, so a score exists to move.
    await saveAnswer(s.id, a.attemptId, typed[3].id, typed[3].correctAnswer);
    await submitAttempt(s.id, a.attemptId);
  }

  const queue = await flaggedQueue(testId);
  const group = queue.find((g) => g.questionId === target.id);
  expect("the answer appears once, not once per student", !!group);
  expect(
    "and carries both students",
    group?.students.length === 2,
    `${group?.students.length}`,
  );
  expect(
    "case and spacing do not split the group",
    (group?.spellings.length ?? 0) === 2,
    group?.spellings.join(" | "),
  );
  expect(
    "the queue leads with the answer most students gave",
    queue[0].students.length >= queue[queue.length - 1].students.length,
  );
  expect(
    "multiple choice never reaches the queue",
    queue.every((g) => g.format !== "grammar_choice"),
  );
  expect(
    "an English answer offers to teach the grader",
    group?.canTeachGrader === true,
  );

  console.log("\nscores before anyone decides");
  const before = await db
    .select()
    .from(attempts)
    .where(eq(attempts.testId, testId))
    .orderBy(asc(attempts.startedAt));
  expect(
    "each student scored only the answer that matched",
    before.every((a) => a.score === 1),
    before.map((a) => a.score).join(", "),
  );

  console.log("\naccepting it");
  const accepted = await resolveFlag({
    questionId: target.id,
    answer: `${NOVEL} spelling`,
    accept: true,
    teachGrader: true,
  });
  expect("settles every student at once", accepted.resolved === 2, `${accepted.resolved}`);
  expect("and recounts both scores", accepted.rescored === 2, `${accepted.rescored}`);
  expect("reports what it taught the grader", accepted.taught === `${NOVEL} spelling`);

  const after = await db
    .select()
    .from(attempts)
    .where(eq(attempts.testId, testId))
    .orderBy(asc(attempts.startedAt));
  expect(
    "the mark the student already saw goes up",
    after.every((a) => a.score === 2),
    after.map((a) => a.score).join(", "),
  );

  const [word] = await db
    .select()
    .from(corpusVocab)
    .where(eq(corpusVocab.id, target.vocabId!));
  expect(
    "the spelling is written back to the corpus",
    word.acceptedAnswers.includes(`${NOVEL} spelling`),
    word.acceptedAnswers.join(" | "),
  );
  const [q] = await db.select().from(questions).where(eq(questions.id, target.id));
  expect(
    "and onto the question, so the test agrees with the decision",
    q.acceptedAnswers.includes(`${NOVEL} spelling`),
  );

  console.log("\nrejecting one");
  const rejected = await resolveFlag({
    questionId: rejectMe.id,
    answer: "total nonsense here",
    accept: false,
    teachGrader: true,
  });
  expect("settles it", rejected.resolved === 2);
  expect("teaches the grader nothing", rejected.taught === null);
  const stillWrong = await db
    .select()
    .from(responses)
    .where(eq(responses.questionId, rejectMe.id));
  expect(
    "marked wrong and no longer flagged",
    stillWrong.every((r) => r.isCorrect === false && r.needsReview === false),
  );
  const [wordUntouched] = await db
    .select()
    .from(corpusVocab)
    .where(eq(corpusVocab.id, rejectMe.vocabId!));
  expect(
    "a rejected answer never reaches the corpus",
    !wordUntouched.acceptedAnswers.includes("total nonsense here"),
  );

  console.log("\nsettled work does not come back");
  const second = await resolveFlag({
    questionId: target.id,
    answer: `${NOVEL} spelling`,
    accept: true,
    teachGrader: true,
  });
  expect("resolving twice is a no-op", second.resolved === 0);
  const left = await flaggedQueue(testId);
  expect(
    "settled answers leave the queue",
    !left.some((g) => g.questionId === target.id || g.questionId === rejectMe.id),
  );
  expect(
    "unsettled ones stay",
    left.some((g) => g.questionId === other.id),
    `${left.length} left`,
  );

  console.log("\nthe statistics can see it now");
  const settled = await db
    .select()
    .from(responses)
    .where(eq(responses.questionId, target.id));
  expect(
    "an accepted answer counts as correct and unflagged",
    settled.every((r) => r.isCorrect === true && r.needsReview === false),
  );

  await deleteTestsForWeeks(WEEKS);
  await db
    .update(corpusVocab)
    .set({ acceptedAnswers: wordBefore.acceptedAnswers })
    .where(eq(corpusVocab.id, target.vocabId!));
  const [wordAfter] = await db
    .select()
    .from(corpusVocab)
    .where(eq(corpusVocab.id, target.vocabId!));
  expect(
    "cleaned up, corpus included",
    !wordAfter.acceptedAnswers.some((a) => a.startsWith("zzcheck")) &&
      (await flaggedTotal()) >= 0,
  );

  console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

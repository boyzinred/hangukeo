/**
 * Checks the weekly test workflow end to end: importing a written test, the
 * audit the teacher's preview and the publish gate both read, the server-owned
 * clock, autosave and resume, grading, what a student can look back on, and
 * the retake rule.
 *
 * The fixture is built through the same importer the real tests go through —
 * there is no second way to make a test any more, and a check that used one
 * would stop describing the product. Works directly against the libs so it
 * needs no request context.
 *
 * It owns weeks 1 and 2 while it runs and clears them at both ends, which also
 * removes the two demo tests `db:seed:demo` puts there. Run `npm run
 * db:seed:demo` afterwards to get the teacher dashboard populated again.
 *
 * Run with `npm run check:test`.
 */
import { and, asc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "./index";
import {
  attempts,
  classSettings,
  corpusGrammar,
  corpusVocab,
  questions,
  responses,
  tests,
  users,
  weekPlanGrammar,
  weekPlanVocab,
  weekPlans,
} from "./schema";
import {
  applyTestFile,
  auditTest,
  CHOICE_COUNT,
  type WeekTestFile,
} from "../lib/test-import";
import { chooseDistractors, seeded, vocabOptionPool } from "../lib/distractors";
import {
  deleteTestsForWeeks,
  setTestStatus,
  studentTestHistory,
  testDetail,
  testQuestions,
} from "../lib/tests";
import {
  attemptResult,
  saveAnswer,
  startOrResume,
  submitAttempt,
  TestError,
} from "../lib/test-taking";

let failures = 0;
function expect(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok    ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function threw(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const WEEKS = [1, 2];

const PASSAGE_KO = "저는 학교에 가요. 친구를 만나서 같이 공부해요.";
const PASSAGE_EN = "I go to school. I meet a friend and we study together.";

/**
 * A test file for a week, composed the way the brief asks for one: mostly this
 * week's words, a slice of earlier weeks, the week's grammar, and a passage.
 */
async function fixtureFor(weekNumber: number): Promise<WeekTestFile> {
  const [settings] = await db.select().from(classSettings).limit(1);

  const pool = await vocabOptionPool(weekNumber);
  const rand = seeded(weekNumber * 991);

  const thisWeek = await db
    .select({ id: corpusVocab.id })
    .from(weekPlanVocab)
    .innerJoin(weekPlans, eq(weekPlans.id, weekPlanVocab.weekPlanId))
    .innerJoin(corpusVocab, eq(corpusVocab.id, weekPlanVocab.vocabId))
    .where(eq(weekPlans.weekNumber, weekNumber))
    .orderBy(asc(corpusVocab.id));

  const earlier =
    weekNumber > 1
      ? await db
          .select({ id: corpusVocab.id })
          .from(weekPlanVocab)
          .innerJoin(weekPlans, eq(weekPlans.id, weekPlanVocab.weekPlanId))
          .innerJoin(corpusVocab, eq(corpusVocab.id, weekPlanVocab.vocabId))
          .where(lt(weekPlans.weekNumber, weekNumber))
          .orderBy(asc(corpusVocab.id))
      : [];

  const reviewWanted = Math.round(
    (settings.testVocabCount * settings.testReviewShare) / 100,
  );
  const review = earlier.slice(0, weekNumber > 1 ? reviewWanted : 0);
  const fresh = thisWeek.slice(0, settings.testVocabCount - review.length);

  const grammar = await db
    .select({ id: corpusGrammar.id, name: corpusGrammar.name })
    .from(weekPlanGrammar)
    .innerJoin(weekPlans, eq(weekPlans.id, weekPlanGrammar.weekPlanId))
    .innerJoin(corpusGrammar, eq(corpusGrammar.id, weekPlanGrammar.grammarId))
    .where(eq(weekPlans.weekNumber, weekNumber))
    .limit(settings.testGrammarCount);

  // Distractors come from every pattern taught by now, not just this week's —
  // four patterns a week cannot fill six options on their own.
  const grammarPool = await db
    .select({ id: corpusGrammar.id })
    .from(weekPlanGrammar)
    .innerJoin(weekPlans, eq(weekPlans.id, weekPlanGrammar.weekPlanId))
    .innerJoin(corpusGrammar, eq(corpusGrammar.id, weekPlanGrammar.grammarId))
    .where(lte(weekPlans.weekNumber, weekNumber));

  return {
    weekNumber,
    title: `Week ${weekNumber} test`,
    passage: { ko: PASSAGE_KO, en: PASSAGE_EN },
    questions: [
      // Alternate direction so both are exercised.
      ...[...fresh, ...review].map((w, i) => {
        const format = (i % 2 === 0 ? "vocab_choice" : "en_to_ko_choice") as
          | "vocab_choice"
          | "en_to_ko_choice";
        const answer = pool.find((c) => c.id === w.id)!;
        return {
          kind: "vocab" as const,
          vocabId: w.id,
          format,
          distractorIds: chooseDistractors(
            answer,
            pool,
            format,
            CHOICE_COUNT - 1,
            rand,
          ).map((d) => d.id),
        };
      }),
      ...grammar.map((g) => ({
        kind: "grammar" as const,
        grammarId: g.id,
        format: "grammar_choice" as const,
        distractorIds: [
          ...new Set(grammarPool.map((o) => o.id)),
        ]
          .filter((id) => id !== g.id)
          .slice(0, CHOICE_COUNT - 1)
          .map((id) => id),
      })),
      {
        kind: "reading" as const,
        prompt: "Where does the writer go?",
        choices: ["To school", "To the market", "To the sea", "To work", "To a shop", "To the park"],
        correctAnswer: "To school",
        targetsVocabId: fresh[0].id,
      },
      {
        kind: "reading" as const,
        prompt: "Who is with the writer?",
        choices: ["A friend", "A teacher", "Nobody", "A brother", "A sister", "A neighbour"],
        correctAnswer: "A friend",
      },
    ],
  };
}

async function main() {
  const [settings] = await db.select().from(classSettings).limit(1);
  const [student] = await db
    .select()
    .from(users)
    .where(sql`'student' = any(${users.roles})`)
    .orderBy(asc(users.displayName))
    .limit(1);

  // Start from a clean slate; demo results occupy weeks 1-2.
  await deleteTestsForWeeks(WEEKS);

  console.log("import");
  const wk1 = await applyTestFile(await fixtureFor(1));
  expect(
    "week 1 has the configured number of words",
    wk1.summary.vocabNew + wk1.summary.vocabReview === settings.testVocabCount,
    `${wk1.summary.vocabNew}+${wk1.summary.vocabReview}`,
  );
  expect("week 1 is all new — nothing earlier exists", wk1.summary.vocabReview === 0);
  expect(
    "includes the week's grammar",
    wk1.summary.grammar === settings.testGrammarCount,
    `${wk1.summary.grammar}`,
  );
  expect("and a reading section", wk1.summary.reading === 2, `${wk1.summary.reading}`);

  const wk2 = await applyTestFile(await fixtureFor(2));
  expect("week 2 draws on earlier weeks", wk2.summary.vocabReview > 0, `${wk2.summary.vocabReview}`);
  expect(
    `review share is about ${settings.testReviewShare}%`,
    Math.abs(wk2.summary.reviewSharePct - settings.testReviewShare) <= 5,
    `${wk2.summary.reviewSharePct}%`,
  );

  // Drop every review word from a week-2 file: the importer must refuse it,
  // because a test with no repeats contributes nothing to retention.
  const withoutRepeats = await fixtureFor(2);
  const noReview = await threw(() =>
    applyTestFile({
      ...withoutRepeats,
      questions: withoutRepeats.questions.filter(
        (q, i) => q.kind !== "vocab" || i < 16,
      ),
    }),
  );
  expect(
    "a week-2 test with no repeats is refused",
    noReview !== null && noReview.includes("Retention"),
    noReview ?? "no error",
  );

  console.log("\nre-importing an unchanged file gives the same test");
  // Week 2, which nothing in this check sits: an import over a started test is
  // refused, and rightly.
  const beforeReimport = await testQuestions(wk2.testId);
  const wk2Again = await applyTestFile(await fixtureFor(2));
  const afterReimport = await testQuestions(wk2Again.testId);
  expect(
    "option order is stable, so the preview the teacher read still holds",
    afterReimport.length === beforeReimport.length &&
      afterReimport.every(
        (q, i) => JSON.stringify(q.choices) === JSON.stringify(beforeReimport[i].choices),
      ),
  );

  const qs = await testQuestions(wk1.testId);
  expect("questions are positioned 1..n", qs.every((q, i) => q.position === i + 1));
  const bothDirections =
    qs.some((q) => q.format === "vocab_choice") &&
    qs.some((q) => q.format === "en_to_ko_choice");
  expect("asks in both directions", bothDirections);
  expect(
    "every question offers options, up to the full set",
    qs.every((q) => {
      const n = q.choices?.length ?? 0;
      return n > 1 && n <= CHOICE_COUNT;
    }),
    qs.map((q) => q.choices?.length ?? 0).join(","),
  );
  expect(
    "nothing is typed any more",
    qs.every((q) => (q.choices?.length ?? 0) > 0),
  );
  const grammarQs = qs.filter((q) => q.kind === "grammar");
  expect(
    "grammar questions offer choices",
    grammarQs.every((q) => (q.choices?.length ?? 0) > 1),
  );
  expect(
    "the correct answer is among the choices",
    grammarQs.every((q) => q.choices!.includes(q.correctAnswer)),
  );

  console.log("\nwhat the teacher previews");
  const detail = (await testDetail(wk1.testId))!;
  expect("the preview carries every question", detail.questions.length === qs.length);
  expect("with the answers", detail.questions.every((q) => !!q.correctAnswer));
  expect("and the passage", detail.passageKo === PASSAGE_KO);
  expect(
    "the teacher's translation is there too, for her eyes",
    detail.passageEn === PASSAGE_EN,
  );
  const previewVocab = detail.questions.filter((q) => q.section === "vocabulary");
  expect(
    "each word says which week assigned it",
    previewVocab.every((q) => q.link?.kind === "vocab" && q.link.assignedWeek !== null),
  );
  expect(
    "a comprehension question is marked as feeding nothing",
    detail.questions.filter((q) => q.section === "reading" && !q.link).length === 1,
  );

  console.log("\nthe audit behind the publish button");
  const clean = await auditTest(wk1.testId);
  expect("an imported test passes", clean.ok, clean.findings.map((f) => f.message).join(" | "));

  // A word can leave the corpus after import; the question survives with its
  // text and would score while feeding nothing. That must block publication.
  const victim = previewVocab[0];
  await db.update(questions).set({ vocabId: null }).where(eq(questions.id, victim.id));
  const brokenAudit = await auditTest(wk1.testId);
  expect(
    "a question that lost its corpus link blocks publishing",
    !brokenAudit.ok,
    brokenAudit.findings.map((f) => f.message).join(" | "),
  );
  await db
    .update(questions)
    .set({ vocabId: (victim.link as { id: string }).id })
    .where(eq(questions.id, victim.id));
  expect("and passes again once restored", (await auditTest(wk1.testId)).ok);

  console.log("\nnot open until published");
  const shut = await threw(() => startOrResume(student.id, wk1.testId));
  expect("a draft cannot be started", shut !== null, shut ?? "no error");

  await setTestStatus(wk1.testId, "published");

  console.log("\nsitting it");
  const active = await startOrResume(student.id, wk1.testId);
  expect("attempt created", !!active.attemptId);
  expect("clock is running", active.secondsRemaining > 0, `${active.secondsRemaining}s`);
  expect(
    "answers are not sent to the browser",
    !JSON.stringify(active.questions).includes("correctAnswer"),
  );
  expect("no saved answers yet", Object.keys(active.saved).length === 0);
  expect(
    "the passage travels with the attempt — reading questions need it",
    active.passage === PASSAGE_KO,
    active.passage ?? "null",
  );
  expect(
    "the teacher's translation does not",
    !JSON.stringify(active).includes(PASSAGE_EN),
  );

  // Answer the first vocab question correctly using the corpus gloss, the
  // second with a listed alternate, the third with nonsense. Reading questions
  // are stored as vocab rows, so select on the section, not the kind.
  const vocabQs = active.questions.filter((q) => q.section === "vocabulary");
  const full = await testQuestions(wk1.testId);
  const byId = new Map(full.map((q) => [q.id, q]));

  const q1 = byId.get(vocabQs[0].id)!;
  await saveAnswer(student.id, active.attemptId, q1.id, q1.correctAnswer);

  const q2 = byId.get(vocabQs[1].id)!;
  const otherOption = q2.choices!.find((c) => c !== q2.correctAnswer)!;
  await saveAnswer(student.id, active.attemptId, q2.id, otherOption);

  const q3 = byId.get(vocabQs[2].id)!;
  await saveAnswer(student.id, active.attemptId, q3.id, q3.correctAnswer);

  const graded = await db
    .select()
    .from(responses)
    .where(eq(responses.attemptId, active.attemptId));
  expect(
    "the chosen option is marked correct",
    graded.find((r) => r.questionId === q1.id)?.isCorrect === true,
  );
  const wrong = graded.find((r) => r.questionId === q2.id);
  expect("a different option is marked wrong", wrong?.isCorrect === false, otherOption);
  // The reason there is no grading queue any more: a wrong option is simply
  // wrong, so nothing is left for a person to settle afterwards.
  expect(
    "and is not flagged — multiple choice leaves nothing to grade by hand",
    wrong?.needsReview === false,
  );

  console.log("\nresume");
  const resumed = await startOrResume(student.id, wk1.testId);
  expect("same attempt, not a new one", resumed.attemptId === active.attemptId);
  expect("saved answers come back", Object.keys(resumed.saved).length === 3);
  expect(
    "the answer text is restored",
    resumed.saved[q1.id] === q1.correctAnswer,
  );

  console.log("\noptions are fair");
  // Picks below must never reuse a question already answered — an overwrite
  // would quietly change what the later assertions are measuring. Twice now
  // that has produced a failure that looked like a code bug and was not.
  const answered = new Set([q1.id, q2.id, q3.id]);
  const takeUnanswered = (predicate: (q: (typeof full)[number]) => boolean) => {
    const found = full.find((q) => predicate(q) && !answered.has(q.id));
    if (!found) throw new Error("ran out of unanswered questions");
    answered.add(found.id);
    return found;
  };

  const vocabRows = full.filter(
    (q) => q.section === "vocabulary" && q.choices!.length === CHOICE_COUNT,
  );
  const slots = new Map<number, number>();
  for (const q of vocabRows) {
    const at = q.choices!.indexOf(q.correctAnswer);
    slots.set(at, (slots.get(at) ?? 0) + 1);
  }
  expect(
    "the answer is spread across the slots, not parked in one",
    slots.size === CHOICE_COUNT &&
      Math.max(...slots.values()) - Math.min(...slots.values()) <= 2,
    [...slots.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(" "),
  );
  expect(
    "and every option is distinct",
    vocabRows.every((q) => new Set(q.choices!).size === q.choices!.length),
  );

  console.log("\nserver-owned clock");
  await db
    .update(attempts)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(attempts.id, active.attemptId));
  const lateQ = takeUnanswered((q) => q.section === "vocabulary");
  const late = await saveAnswer(
    student.id,
    active.attemptId,
    lateQ.id,
    "too late",
  );
  expect("a save after expiry is refused", late.saved === false);
  const lateRows = await db
    .select()
    .from(responses)
    .where(
      and(
        eq(responses.attemptId, active.attemptId),
        eq(responses.questionId, lateQ.id),
      ),
    );
  expect("and nothing is written", lateRows.length === 0);

  console.log("\nsubmit");
  // Expected score comes from what was actually saved; the literal below is
  // only a guard that the picks above still mean what they say (two right,
  // one wrong), not the source of truth.
  const expectedScore = (
    await db
      .select()
      .from(responses)
      .where(eq(responses.attemptId, active.attemptId))
  ).filter((r) => r.isCorrect).length;

  const result = await submitAttempt(student.id, active.attemptId);
  expect(
    "score matches the saved answers",
    result.score === expectedScore && expectedScore === 2,
    `${result.score} scored, ${expectedScore} correct answers saved`,
  );
  expect("max score is the whole test", result.maxScore === qs.length, `${result.maxScore}`);

  const [after] = await db
    .select()
    .from(attempts)
    .where(eq(attempts.id, active.attemptId));
  expect("attempt marked submitted", after.state === "submitted");
  expect("submitted time recorded", after.submittedAt !== null);

  console.log("\nlooking back at it");
  const review = await attemptResult(student.id, active.attemptId);
  expect("result shows the model answers", review!.answers.every((a) => !!a.correct));
  expect(
    "every question is there, answered or not",
    review!.answers.length === qs.length,
    `${review!.answers.length} of ${qs.length}`,
  );
  expect(
    "skipped questions read as skipped rather than wrong-looking blanks",
    review!.answers.some((a) => a.given === null),
  );
  expect("the passage comes back with it", review!.passage === PASSAGE_KO);

  const history = await studentTestHistory(student.id);
  const seen = history.find((h) => h.id === wk1.testId);
  expect("the sat test appears in history", !!seen);
  expect(
    "with the score on it",
    seen?.state === "submitted" && seen.score === result.score,
    `${seen?.state} ${seen?.score}`,
  );
  expect(
    "a draft never appears in a student's history",
    !history.some((h) => h.id === wk2.testId),
  );

  console.log("\nretake rule");
  const again = await threw(() => startOrResume(student.id, wk1.testId));
  expect("a second sitting is refused without a grant", again !== null, again ?? "no error");

  console.log("\nclosing");
  await setTestStatus(wk1.testId, "closed");
  const [closedRow] = await db.select().from(tests).where(eq(tests.id, wk1.testId));
  expect("closing stamps the time", closedRow.closesAt !== null);
  const afterClose = await studentTestHistory(student.id);
  expect(
    "a closed test stays readable in history",
    afterClose.some((h) => h.id === wk1.testId),
  );

  // Cleanup: remove the imported tests and restore the demo data.
  await deleteTestsForWeeks(WEEKS);
  const leftover = await db
    .select()
    .from(tests)
    .innerJoin(weekPlans, eq(weekPlans.id, tests.weekPlanId))
    .where(inArray(weekPlans.weekNumber, WEEKS));
  expect("cleaned up", leftover.length === 0);

  console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  if (e instanceof TestError) console.error("TestError:", e.message);
  else console.error(e);
  process.exit(1);
});

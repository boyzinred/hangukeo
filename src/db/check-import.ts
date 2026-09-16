/**
 * Checks that the test-file validator refuses what would quietly corrupt the
 * statistics, and that an imported test derives its content from the corpus.
 *
 * Two separate things are checked, deliberately. One assertion reads the real
 * `src/tests/week-03.ts` and only asks whether it still validates, so authoring
 * a broken test is caught here. Everything else runs against a fixture this
 * file builds on the last planned week, so that rewriting week 3's content —
 * which is content, and changes — never breaks the suite, and so this check
 * never deletes a test somebody is using. An earlier version asserted on week
 * 3's first word by id and failed the moment that test was rewritten.
 *
 * Run with `npm run check:import`.
 */
import { asc, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "./index";
import {
  corpusGrammar,
  corpusVocab,
  questions,
  tests,
  weekPlanGrammar,
  weekPlanVocab,
  weekPlans,
} from "./schema";
import {
  applyTestFile,
  CHOICE_COUNT,
  validateTestFile,
  type WeekTestFile,
} from "../lib/test-import";
import { chooseDistractors, grammarOptionPool, seeded, vocabOptionPool } from "../lib/distractors";
import { deleteTestsForWeeks } from "../lib/tests";
import weekThree from "../tests/week-03";

let failures = 0;
function expect(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok    ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function errorsFor(file: WeekTestFile): Promise<string[]> {
  const r = await validateTestFile(file);
  return r.findings.filter((f) => f.level === "error").map((f) => f.message);
}

const PASSAGE = "학교에 가서 친구를 만나고 같이 공부했어요.";

/** A valid test on `week`, built from the plan: 6 new, 3 review, grammar, reading. */
async function fixture(week: number) {
  const fresh = await db
    .select({ id: corpusVocab.id })
    .from(weekPlanVocab)
    .innerJoin(weekPlans, eq(weekPlans.id, weekPlanVocab.weekPlanId))
    .innerJoin(corpusVocab, eq(corpusVocab.id, weekPlanVocab.vocabId))
    .where(eq(weekPlans.weekNumber, week))
    .orderBy(asc(corpusVocab.id))
    .limit(6);

  const review = await db
    .select({ id: corpusVocab.id })
    .from(weekPlanVocab)
    .innerJoin(weekPlans, eq(weekPlans.id, weekPlanVocab.weekPlanId))
    .innerJoin(corpusVocab, eq(corpusVocab.id, weekPlanVocab.vocabId))
    .where(lt(weekPlans.weekNumber, week))
    .orderBy(asc(corpusVocab.id))
    .limit(3);

  const grammar = await db
    .select({ id: corpusGrammar.id, name: corpusGrammar.name })
    .from(weekPlanGrammar)
    .innerJoin(weekPlans, eq(weekPlans.id, weekPlanGrammar.weekPlanId))
    .innerJoin(corpusGrammar, eq(corpusGrammar.id, weekPlanGrammar.grammarId))
    .where(eq(weekPlans.weekNumber, week))
    .limit(4);

  const pool = await vocabOptionPool(week);
  const grammarPool = await grammarOptionPool(week);
  const rand = seeded(week * 7717);

  const SIX = (base: string[]) =>
    Array.from({ length: CHOICE_COUNT }, (_, i) => base[i] ?? `Option ${i + 1}`);

  const file: WeekTestFile = {
    weekNumber: week,
    title: `Import check week ${week}`,
    passage: { ko: PASSAGE, en: "I went to school, met a friend and we studied." },
    questions: [
      ...[...fresh, ...review].map((w) => ({
        kind: "vocab" as const,
        vocabId: w.id,
        format: "vocab_choice" as const,
        distractorIds: chooseDistractors(
          pool.find((c) => c.id === w.id)!,
          pool,
          "vocab_choice",
          CHOICE_COUNT - 1,
          rand,
        ).map((d) => d.id),
      })),
      ...grammar.map((g) => ({
        kind: "grammar" as const,
        grammarId: g.id,
        format: "grammar_choice" as const,
        distractorIds: grammarPool
          .filter((o) => o.id !== g.id)
          .slice(0, CHOICE_COUNT - 1)
          .map((o) => o.id),
      })),
      {
        kind: "reading" as const,
        prompt: "Where did they go?",
        choices: SIX(["To school", "To work", "To a shop", "Home", "To a park", "To a cafe"]),
        correctAnswer: "To school",
        targetsVocabId: fresh[0].id,
      },
      ...["Who did they meet?", "What did they do?", "When was it?"].map((p) => ({
        kind: "reading" as const,
        prompt: p,
        choices: SIX(["A friend", "A teacher", "Nobody", "A neighbour", "A cousin", "A stranger"]),
        correctAnswer: "A friend",
      })),
    ],
  };
  return { file, fresh, review, grammar, pool, grammarPool };
}

async function main() {
  console.log("the test file in the repo");
  const good = await validateTestFile(weekThree);
  expect(
    "src/tests/week-03.ts still validates",
    good.ok,
    good.findings.filter((f) => f.level === "error").map((f) => f.message).join(" | "),
  );
  expect(
    "and its composition is read from the plan, not from the file",
    good.summary.vocabNew + good.summary.vocabReview > 0 &&
      good.summary.vocabReview > 0,
    `${good.summary.vocabNew} new / ${good.summary.vocabReview} review`,
  );

  // The last planned week: far from anything a person is working on.
  const [last] = await db
    .select({ w: weekPlans.weekNumber })
    .from(weekPlans)
    .orderBy(desc(weekPlans.weekNumber))
    .limit(1);
  const WEEK = last.w;
  await deleteTestsForWeeks([WEEK]);

  const { file, fresh, grammar, grammarPool } = await fixture(WEEK);
  const clone = (o: Partial<WeekTestFile>): WeekTestFile => ({ ...file, ...o });

  console.log(`\nrefuses what would break the statistics (week ${WEEK})`);
  expect("the fixture itself is valid", (await errorsFor(file)).length === 0);

  const unknownId = await errorsFor(
    clone({
      questions: [
        {
          kind: "vocab",
          vocabId: "v9999",
          format: "vocab_choice",
          distractorIds: (file.questions[0] as { distractorIds: string[] }).distractorIds,
        },
        ...file.questions.slice(1),
      ],
    }),
  );
  expect(
    "unknown vocabulary id",
    unknownId.some((m) => m.includes("Unknown vocabulary id")),
    unknownId[0] ?? "no error",
  );

  // A word that is real and in the corpus but not taught until after this
  // week — the case a plain "does this id exist" check would wave through.
  const [future] = await db
    .select({ id: weekPlanVocab.vocabId })
    .from(weekPlanVocab)
    .innerJoin(weekPlans, eq(weekPlans.id, weekPlanVocab.weekPlanId))
    .groupBy(weekPlanVocab.vocabId)
    .having(sql`min(${weekPlans.weekNumber}) > 1`)
    .limit(1);
  const early = await fixture(1);
  const notYet = await errorsFor({
    ...early.file,
    questions: [
      {
        kind: "vocab",
        vocabId: future.id,
        format: "vocab_choice",
        distractorIds: (early.file.questions[0] as { distractorIds: string[] }).distractorIds,
      },
      ...early.file.questions.slice(1),
    ],
  });
  expect(
    "a word not yet assigned",
    notYet.some((m) => m.includes("has not been assigned")),
    notYet[0] ?? "no error",
  );

  const badChoices = await errorsFor(
    clone({
      questions: [
        ...file.questions.filter((q) => q.kind !== "grammar"),
        {
          kind: "grammar",
          grammarId: grammar[0].id,
          format: "grammar_choice",
          // Its own id listed as a distractor, so one option is the answer twice.
          distractorIds: [
            grammar[0].id,
            ...grammarPool.filter((o) => o.id !== grammar[0].id).slice(0, CHOICE_COUNT - 2).map((o) => o.id),
          ],
        },
      ],
    }),
  );
  expect(
    "the answer listed among its own distractors",
    badChoices.some((m) => m.includes("also listed as a distractor")),
    badChoices[0] ?? "no error",
  );

  const badReading = await errorsFor(
    clone({
      questions: [
        ...file.questions.filter((q) => q.kind !== "reading"),
        {
          kind: "reading",
          prompt: "Where did they go?",
          choices: ["A", "B", "C2", "D", "E", "F"],
          correctAnswer: "C",
        },
      ],
    }),
  );
  expect(
    "a reading answer that is not among its choices",
    badReading.some((m) => m.includes("is not one of the choices")),
    badReading[0] ?? "no error",
  );

  const noReview = await errorsFor(
    clone({
      questions: file.questions.filter(
        (q) => q.kind !== "vocab" || fresh.some((f) => f.id === q.vocabId),
      ),
    }),
  );
  expect(
    "a test with no words from earlier weeks",
    noReview.some((m) => m.includes("Retention is computed")),
    noReview[0] ?? "no error",
  );

  const orphanPassage = await validateTestFile(
    clone({ questions: file.questions.filter((q) => q.kind !== "reading") }),
  );
  expect(
    "warns about a passage nothing asks about",
    orphanPassage.findings.some((f) => f.message.includes("nothing asks about it")),
  );

  console.log("\nimport derives content from the corpus");
  const applied = await applyTestFile(file);
  expect("imported", !!applied.testId);

  const written = await db
    .select()
    .from(questions)
    .where(eq(questions.testId, applied.testId));
  expect("every question written", written.length === file.questions.length);

  const first = written.find((q) => q.position === 1)!;
  const [word] = await db
    .select()
    .from(corpusVocab)
    .where(eq(corpusVocab.id, fresh[0].id));
  expect(
    "prompt taken from the corpus, not from the file",
    first.prompt === word.korean,
    `${first.prompt} vs ${word.korean}`,
  );
  expect(
    "accepted answers taken from the corpus",
    JSON.stringify(first.acceptedAnswers) === JSON.stringify(word.acceptedAnswers),
  );

  const linked = written.filter((q) => q.section === "reading" && q.vocabId);
  const unlinked = written.filter((q) => q.section === "reading" && !q.vocabId);
  expect("a targeted reading question keeps its word", linked.length === 1, `${linked.length}`);
  expect("comprehension questions carry no word", unlinked.length === 3, `${unlinked.length}`);

  const [row] = await db.select().from(tests).where(eq(tests.id, applied.testId));
  expect("passage stored", (row.passageKo ?? "") === PASSAGE);
  expect("imported tests start as drafts", row.status === "draft");

  console.log("\nre-import");
  const again = await applyTestFile(file);
  expect("replaces cleanly while nobody has sat it", again.replaced === true);

  await deleteTestsForWeeks([WEEK]);
  const left = await db
    .select()
    .from(tests)
    .innerJoin(weekPlans, eq(weekPlans.id, tests.weekPlanId))
    .where(eq(weekPlans.weekNumber, WEEK));
  expect("cleaned up", left.length === 0);

  console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

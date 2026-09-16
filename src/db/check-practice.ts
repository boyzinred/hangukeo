/**
 * Exercises the practice-save path end to end against the real database,
 * standing in for a browser click-through. Run with `npm run check:practice`.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "./index";
import { corpusVocab, practiceResponses, practiceRuns, users } from "./schema";
import { deletePracticeRun, recordPracticeRun } from "../lib/practice";
import { drillPhase, scores } from "../lib/drill-state";
import { sentenceMatches } from "../lib/quiz";

let failures = 0;
function expect(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok    ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

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

/**
 * The retry rule, as a table. The user-visible promise is "no hint until the
 * second miss", and the difference between revealing on the first and on the
 * second is invisible in a screenshot.
 */
function checkDrillPhases() {
  console.log("drill: when the answer appears");
  const right = { correct: true };
  const wrong = { correct: false };

  const cases: [string, { correct: boolean }[], boolean, Partial<ReturnType<typeof drillPhase>>][] = [
    ["fresh question takes input", [], true, { accepting: true, revealed: false, canAdvance: false }],
    ["right first time moves on", [right], true, { revealed: false, canAdvance: true, accepting: false }],
    ["one miss, retry on: no hint, must try again", [wrong], true, { revealed: false, mustRetry: true, accepting: true, canAdvance: false }],
    ["two misses, retry on: answer shown, still must type it", [wrong, wrong], true, { revealed: true, mustRetry: true, accepting: true, canAdvance: false }],
    ["recovered on retry moves on", [wrong, right], true, { revealed: false, mustRetry: false, canAdvance: true, accepting: false }],
    ["one miss, retry off: answer shown and the box closes", [wrong], false, { revealed: true, mustRetry: false, accepting: false, canAdvance: true }],
  ];

  for (const [label, attempts, retry, want] of cases) {
    const got = drillPhase(attempts, retry);
    const ok = (Object.keys(want) as (keyof typeof want)[]).every((k) => got[k] === want[k]);
    expect(label, ok, JSON.stringify(got));
  }

  expect("only a first-attempt answer scores", scores([right]) && !scores([wrong, right]));

  // Sentence answers are marked on the words, not on the typing around them:
  // a student who leaves off the full stop has still translated the sentence.
  console.log("\ngrammar: marking a translated sentence");
  const model = "저는 학생이에요.";
  expect("exact match", sentenceMatches(model, model));
  expect("a missing full stop still passes", sentenceMatches(model, "저는 학생이에요"));
  expect("spacing is ignored", sentenceMatches(model, "저는학생이에요."));
  expect("a different ending is wrong", !sentenceMatches(model, "저는 선생님이에요"));
  expect("blank is wrong", !sentenceMatches(model, "   "));
}

async function main() {
  const [me] = await db
    .select()
    .from(users)
    .where(sql`'student' = any(${users.roles})`)
    .orderBy(users.createdAt)
    .limit(1);
  checkDrillPhases();
  console.log(`\nacting as ${me.displayName}`);

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
  expect(
    "only the first-try-correct word raises studied",
    ok,
    `saved=${res.saved} total=${run.total} firstTryCorrect=${run.firstTryCorrect} studied ${before}→${after}`,
  );

  await deletePracticeRun(run.id);
  console.log("cleaned up");

  console.log(failures === 0 ? "\nPASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

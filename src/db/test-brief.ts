/**
 * Prints everything needed to write a week's test.
 *
 *   npm run test:brief -- --week 3
 *
 * Paste the output into a conversation and ask for the test file. The ids are
 * the important part: a test refers to words by id, and the prompt and answers
 * are read from the corpus at import, so the file cannot drift from the bank.
 */
import { CHOICE_COUNT, weekBrief } from "../lib/test-import";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const week = Number(arg("week"));
  if (!Number.isFinite(week)) {
    console.error("Usage: npm run test:brief -- --week 3");
    process.exit(1);
  }

  const { settings, plan, thisWeek, grammar, weak, earlier } =
    await weekBrief(week);

  const reviewWanted = Math.round(
    (settings.testVocabCount * settings.testReviewShare) / 100,
  );
  const newWanted = settings.testVocabCount - reviewWanted;

  console.log(`# Week ${week} test brief`);
  console.log(`# ${plan.startsOn} to ${plan.endsOn}\n`);

  console.log("## What the test must contain");
  console.log(`- ${settings.testVocabCount} vocabulary questions:`);
  console.log(`    about ${newWanted} from this week, ${reviewWanted} from earlier weeks`);
  console.log(`- ${settings.testGrammarCount} grammar questions`);
  console.log(`- a short Korean reading passage plus 3-5 questions about it`);
  console.log(`- ${CHOICE_COUNT} options on every question`);
  console.log(`- ${settings.testTimeLimitMinutes} minute limit\n`);
  console.log("Everything is multiple choice; nothing is typed.\n");
  console.log("Rules the importer enforces:");
  console.log("- refer to words and patterns by id only; never write the Korean or the gloss");
  console.log(`- give ${CHOICE_COUNT - 1} distractorIds per question, also by id`);
  console.log("- distractors must share the answer's part of speech");
  console.log("- distractors must be words already taught by this week");
  console.log("- no option may repeat, and none may be the answer twice");
  console.log("- the answer must not stand out by length; the importer places it,");
  console.log("  so option order is not yours to set");
  console.log("- only words assigned by this week or earlier");
  console.log("- the passage may use only words from the lists below");
  console.log(
    week > 1
      ? "- at least some review words, or retention cannot be computed\n"
      : "- week 1 has no earlier words, so it is all new\n",
  );

  console.log(`## This week's words (${thisWeek.length})`);
  for (const w of thisWeek) {
    console.log(
      `${w.id}  ${w.korean}\t${w.english}\t[${w.partOfSpeech ?? "?"}] day ${w.studyDay}`,
    );
  }

  console.log(`\n## This week's grammar (${grammar.length})`);
  for (const g of grammar) {
    console.log(`${g.id}  ${g.form}\t${g.name}\t${g.meaning}`);
  }

  if (weak.length) {
    console.log(`\n## Worth re-testing — the class gets these wrong (${weak.length})`);
    for (const w of weak) {
      console.log(
        `${w.id}  ${w.korean}\t${w.english}\t${w.wrong}/${w.asked} wrong`,
      );
    }
  }

  if (earlier.length) {
    console.log(`\n## Earlier weeks, eligible for review (${earlier.length})`);
    // Grouped by week so a sensible spread is easy to pick.
    const byWeek = new Map<number, typeof earlier>();
    for (const w of earlier) {
      if (!byWeek.has(w.weekNumber)) byWeek.set(w.weekNumber, []);
      byWeek.get(w.weekNumber)!.push(w);
    }
    for (const [wk, words] of [...byWeek.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`\n### Week ${wk} (${words.length})`);
      for (const w of words) console.log(`${w.id}  ${w.korean}\t${w.english}`);
    }
  }

  console.log(`\n## Write to src/tests/week-${String(week).padStart(2, "0")}.ts`);
  console.log(`Then: npm run test:import -- --week ${week}          # validate`);
  console.log(`      npm run test:import -- --week ${week} --apply  # write it`);
  console.log("");
  console.log("It lands as a draft. The teacher reads the whole thing at");
  console.log("/teacher/tests and publishes it herself; she cannot edit it");
  console.log("there, so changes come back here and are re-imported.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

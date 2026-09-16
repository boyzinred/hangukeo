import "server-only";

import { asc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { corpusGrammar, corpusVocab, weekPlanGrammar, weekPlanVocab, weekPlans } from "@/db/schema";
import { lengthOutlier } from "./test-import";

/**
 * Choosing the wrong options.
 *
 * A multiple-choice question measures nothing unless every option is a real
 * candidate. The two ways that fails are both mechanical: an option of a
 * different kind (one verb among five particles) and an option of a different
 * length (the careful correct answer against four throwaways). Both are ruled
 * out here rather than left to the author's eye, and the validator then checks
 * that whoever wrote the file actually did it.
 *
 * Only words already taught are eligible. A distractor nobody has met is
 * eliminated on sight by a student who has been paying attention, which hands
 * out the answer to exactly the people who need testing least.
 */

export type Candidate = {
  id: string;
  korean: string;
  english: string;
  partOfSpeech: string | null;
};

/** Every word that may appear as an option on a given week's test. */
export async function vocabOptionPool(weekNumber: number): Promise<Candidate[]> {
  return db
    .selectDistinctOn([corpusVocab.id], {
      id: corpusVocab.id,
      korean: corpusVocab.korean,
      english: corpusVocab.english,
      partOfSpeech: corpusVocab.partOfSpeech,
    })
    .from(weekPlanVocab)
    .innerJoin(weekPlans, eq(weekPlans.id, weekPlanVocab.weekPlanId))
    .innerJoin(corpusVocab, eq(corpusVocab.id, weekPlanVocab.vocabId))
    .where(lte(weekPlans.weekNumber, weekNumber))
    .orderBy(asc(corpusVocab.id));
}

export async function grammarOptionPool(weekNumber: number) {
  return db
    .selectDistinctOn([corpusGrammar.id], {
      id: corpusGrammar.id,
      form: corpusGrammar.form,
      name: corpusGrammar.name,
    })
    .from(weekPlanGrammar)
    .innerJoin(weekPlans, eq(weekPlans.id, weekPlanGrammar.weekPlanId))
    .innerJoin(corpusGrammar, eq(corpusGrammar.id, weekPlanGrammar.grammarId))
    .where(lte(weekPlans.weekNumber, weekNumber))
    .orderBy(asc(corpusGrammar.id));
}

/** The text a candidate shows as an option, in the direction being asked. */
function optionText(format: string, c: Candidate): string {
  return format === "en_to_ko_choice" ? c.korean : c.english;
}

/**
 * Picks distractors for one word.
 *
 * Same part of speech, then closest by the length of the text that will
 * actually be shown — comparing English glosses for a Korean prompt and
 * Korean for an English one, since that is what the student sees. A window of
 * the nearest candidates is drawn from rather than simply taking the top few,
 * so the same handful of words do not become the distractor for everything.
 */
export function chooseDistractors(
  answer: Candidate,
  pool: Candidate[],
  format: "vocab_choice" | "en_to_ko_choice",
  count: number,
  rand: () => number,
): Candidate[] {
  const target = optionText(format, answer).length;
  const seenText = new Set([optionText(format, answer).trim().toLowerCase()]);

  const eligible = pool.filter((c) => {
    if (c.id === answer.id) return false;
    if (answer.partOfSpeech && c.partOfSpeech !== answer.partOfSpeech) return false;
    // Two options that read the same make both wrong, handing over a free
    // elimination.
    const text = optionText(format, c).trim().toLowerCase();
    if (seenText.has(text)) return false;
    seenText.add(text);
    return true;
  });

  const byCloseness = [...eligible].sort(
    (a, b) =>
      Math.abs(optionText(format, a).length - target) -
      Math.abs(optionText(format, b).length - target),
  );

  const draw = (window: Candidate[]): Candidate[] => {
    const picked: Candidate[] = [];
    const taken = new Set<number>();
    while (picked.length < count && taken.size < window.length) {
      const i = Math.floor(rand() * window.length);
      if (taken.has(i)) continue;
      taken.add(i);
      picked.push(window[i]);
    }
    return picked;
  };

  /** The rule the validator will apply, checked here so it rarely has to. */
  const evenEnough = (picked: Candidate[]) => {
    if (picked.length < count) return false;
    const answerText = optionText(format, answer);
    return (
      lengthOutlier(
        [answerText, ...picked.map((d) => optionText(format, d))],
        answerText,
      ) === null
    );
  };

  // Widest window first, so the same few words do not become the distractor
  // for everything; narrow only when the spread would make the answer stand
  // out by length, which is the tell the whole exercise is about.
  for (const width of [count * 4, count * 3, count * 2, count]) {
    const picked = draw(byCloseness.slice(0, Math.max(width, count)));
    if (evenEnough(picked)) return picked;
  }
  return byCloseness.slice(0, count);
}

/** Deterministic randomness, so re-running authoring produces the same file. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

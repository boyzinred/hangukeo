import "server-only";

import { asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  attempts,
  classSettings,
  corpusGrammar,
  corpusVocab,
  questions,
  tests,
  weekPlanGrammar,
  weekPlanVocab,
  weekPlans,
} from "@/db/schema";

/**
 * Importing a hand-authored weekly test.
 *
 * Vocabulary and grammar questions carry only an id. Their prompt, correct
 * answer and accepted spellings come from the corpus at import time, so a test
 * file cannot disagree with the bank about what a word means, and editing a
 * gloss later does not leave old tests asserting the old one.
 *
 * That is also what keeps the statistics working. Every figure the teacher
 * sees — studied, verified, retention, accuracy by part of speech — is grouped
 * by corpus id. A question written as free text would score correctly and then
 * contribute nothing to any of them, silently. Reading questions are the one
 * exception: they have no corpus entry, so they count toward the score only,
 * and the validator says so rather than letting it be discovered later.
 */

/**
 * Every question is multiple choice, and every option that has a corpus entry
 * is named by id rather than written out.
 *
 * Distractors decide whether a choice question measures anything. Given as
 * free text they could be anything — a different part of speech, a word the
 * class has never met, a gloss twice the length of the others — and none of
 * that is checkable. Given as ids, the validator can insist they are real
 * words, already taught, of the same kind, and of comparable length, which is
 * what stops the answer being findable without knowing it.
 */
export type ImportedQuestion =
  | {
      kind: "vocab";
      /** corpus_vocab.id, e.g. "v0123". */
      vocabId: string;
      /** Korean prompt with English options, or the reverse. */
      format: "vocab_choice" | "en_to_ko_choice";
      /** CHOICE_COUNT - 1 other corpus ids; their glosses become the wrong options. */
      distractorIds: string[];
    }
  | {
      kind: "grammar";
      /** corpus_grammar.id, e.g. "g1-g05". */
      grammarId: string;
      format: "grammar_choice";
      /** CHOICE_COUNT - 1 other pattern ids. */
      distractorIds: string[];
    }
  | {
      kind: "reading";
      prompt: string;
      /** CHOICE_COUNT options. No corpus entry stands behind these. */
      choices: string[];
      correctAnswer: string;
      /**
       * Optional. Set when the question really turns on one word, so it feeds
       * that word's mastery; leave unset for comprehension questions, which
       * then count toward the score only.
       */
      targetsVocabId?: string;
    };

/** Options per question. Six rather than four: guessing gets you 17% not 25%,
 * and "verified" needs two correct tests, so the floor under a falsely
 * verified word drops from 6% to under 3%. */
export const CHOICE_COUNT = 6;

/** How far the answer may sit from its nearest option, as a share of it. */
const LENGTH_GAP = 0.4;
/** Chance puts the answer longest 1 in CHOICE_COUNT times; well past that is a tell. */
const LONGEST_RATE_LIMIT = 0.34;


export type WeekTestFile = {
  weekNumber: number;
  title?: string;
  timeLimitMinutes?: number;
  /** Korean passage plus a translation kept for the teacher, never shown. */
  passage?: { ko: string; en: string };
  questions: ImportedQuestion[];
};

export type Finding = { level: "error" | "warning"; message: string };

export type ValidationReport = {
  ok: boolean;
  findings: Finding[];
  summary: {
    weekNumber: number;
    total: number;
    vocabNew: number;
    vocabReview: number;
    grammar: number;
    reading: number;
    readingScoreOnly: number;
    reviewSharePct: number;
    /** How often the correct option is the longest — chance is 1/CHOICE_COUNT. */
    longestIsAnswerPct: number;
  };
};

type VocabRow = typeof corpusVocab.$inferSelect;
type GrammarRow = typeof corpusGrammar.$inferSelect;

/** The text of each option, in the direction the question asks. */
function optionFor(format: string, word: VocabRow): string {
  return format === "en_to_ko_choice" ? word.korean : word.english;
}

/**
 * Whether the answer stands out by length.
 *
 * The oldest trick in multiple choice is that the careful, qualified, correct
 * answer is visibly longer than the throwaway wrong ones, so it can be picked
 * without reading it. What makes it findable is *isolation*, not the average:
 * an answer at one extreme with nothing near it. So this asks two things — is
 * the answer the only option at its extreme, and is there a real gap to the
 * closest other option.
 *
 * Measuring against the mean instead flagged "yes" among "no", "wow" and "ugh,
 * sigh", where the answer is neither the shortest nor isolated, and missed
 * nothing the gap test catches.
 */
export function lengthOutlier(options: string[], correct: string): "long" | "short" | null {
  const others = options.filter((o) => o !== correct).map((o) => o.length);
  if (others.length === 0) return null;
  const len = correct.length;

  const uniquelyLongest = others.every((o) => o < len);
  const uniquelyShortest = others.every((o) => o > len);
  if (!uniquelyLongest && !uniquelyShortest) return null;

  const nearest = others.reduce((a, b) =>
    Math.abs(b - len) < Math.abs(a - len) ? b : a,
  );
  if (nearest === 0) return null;
  if (Math.abs(len - nearest) <= nearest * LENGTH_GAP) return null;

  return uniquelyLongest ? "long" : "short";
}

/**
 * Deterministic randomness, seeded by the week.
 *
 * Option order has to be unpredictable to the student but identical every time
 * the same file is imported — otherwise the test the teacher approved in the
 * preview is not the test a re-import produces, and she would have to read it
 * again to find out whether anything moved.
 */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(list: T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Where the correct option sits, for every choice question on the test.
 *
 * Built as a balanced list and then shuffled, rather than drawn at random per
 * question: random placement leaves streaks and gaps, and a student who
 * notices the answer is rarely last has been handed something. Each slot gets
 * the same number of answers, in an order nobody can predict.
 */
function answerSlots(count: number, seed: number): number[] {
  const balanced = Array.from({ length: count }, (_, i) => i % CHOICE_COUNT);
  return shuffled(balanced, seededRandom(seed));
}

/**
 * Checks a file against the corpus and the week plan.
 *
 * Everything that would corrupt a statistic is an error, not a warning: an
 * unknown id, a word never assigned, a distractor of the wrong kind. Warnings
 * are for things that are merely questionable.
 */
export async function validateTestFile(
  file: WeekTestFile,
): Promise<ValidationReport> {
  const findings: Finding[] = [];
  const err = (m: string) => findings.push({ level: "error", message: m });
  const warn = (m: string) => findings.push({ level: "warning", message: m });

  const [settings] = await db.select().from(classSettings).limit(1);
  const [plan] = await db
    .select()
    .from(weekPlans)
    .where(eq(weekPlans.weekNumber, file.weekNumber))
    .limit(1);

  const empty = {
    weekNumber: file.weekNumber,
    total: file.questions.length,
    vocabNew: 0,
    vocabReview: 0,
    grammar: 0,
    reading: 0,
    readingScoreOnly: 0,
    reviewSharePct: 0,
    longestIsAnswerPct: 0,
  };

  if (!plan) {
    err(`No plan for week ${file.weekNumber}.`);
    return { ok: false, findings, summary: empty };
  }
  if (file.questions.length === 0) err("The file has no questions.");

  // --- resolve everything the file refers to --------------------------
  const vocabIds = [
    ...new Set(
      file.questions.flatMap((q) =>
        q.kind === "vocab"
          ? [q.vocabId, ...q.distractorIds]
          : q.kind === "reading" && q.targetsVocabId
            ? [q.targetsVocabId]
            : [],
      ),
    ),
  ];
  const grammarIds = [
    ...new Set(
      file.questions.flatMap((q) =>
        q.kind === "grammar" ? [q.grammarId, ...q.distractorIds] : [],
      ),
    ),
  ];

  const vocabRows = vocabIds.length
    ? await db.select().from(corpusVocab).where(inArray(corpusVocab.id, vocabIds))
    : [];
  const grammarRows = grammarIds.length
    ? await db
        .select()
        .from(corpusGrammar)
        .where(inArray(corpusGrammar.id, grammarIds))
    : [];

  const vocabById = new Map(vocabRows.map((v) => [v.id, v]));
  const grammarById = new Map(grammarRows.map((g) => [g.id, g]));

  for (const id of vocabIds) {
    if (!vocabById.has(id)) {
      err(`Unknown vocabulary id "${id}". Every id must exist in corpus_vocab.`);
    }
  }
  for (const id of grammarIds) {
    if (!grammarById.has(id)) {
      err(`Unknown grammar id "${id}". Every id must exist in corpus_grammar.`);
    }
  }

  // --- was it actually assigned? --------------------------------------
  const assignedWeek = new Map(
    (
      await db
        .select({
          vocabId: weekPlanVocab.vocabId,
          weekNumber: weekPlans.weekNumber,
        })
        .from(weekPlanVocab)
        .innerJoin(weekPlans, eq(weekPlans.id, weekPlanVocab.weekPlanId))
        .where(lte(weekPlans.weekNumber, file.weekNumber))
    ).map((r) => [r.vocabId, r.weekNumber]),
  );

  const assignedGrammar = new Set(
    (
      await db
        .select({ grammarId: weekPlanGrammar.grammarId })
        .from(weekPlanGrammar)
        .innerJoin(weekPlans, eq(weekPlans.id, weekPlanGrammar.weekPlanId))
        .where(lte(weekPlans.weekNumber, file.weekNumber))
    ).map((r) => r.grammarId),
  );

  /**
   * How many legitimate options exist at all, by part of speech.
   *
   * Early weeks cannot fill six. Week 1 has taught four grammar patterns, so a
   * grammar question has three possible distractors and no more; some parts of
   * speech are just as thin. Demanding six regardless would leave only two
   * ways out, and both are worse than a short question: a distractor nobody
   * has been taught, or one of a different kind. So the requirement is six or
   * everything available, whichever is smaller, and falling short is said out
   * loud rather than passed over.
   */
  const taughtByPos = new Map(
    (
      await db
        .selectDistinctOn([corpusVocab.id], {
          id: corpusVocab.id,
          pos: corpusVocab.partOfSpeech,
        })
        .from(weekPlanVocab)
        .innerJoin(weekPlans, eq(weekPlans.id, weekPlanVocab.weekPlanId))
        .innerJoin(corpusVocab, eq(corpusVocab.id, weekPlanVocab.vocabId))
        .where(lte(weekPlans.weekNumber, file.weekNumber))
    ).reduce((m, r) => m.set(r.pos ?? "", (m.get(r.pos ?? "") ?? 0) + 1), new Map<string, number>()),
  );
  const taughtTotal = [...taughtByPos.values()].reduce((a, b) => a + b, 0);

  /** Distractors this question could have, given what the class has met. */
  const availableFor = (pos: string | null): number =>
    Math.max(0, (pos ? (taughtByPos.get(pos) ?? 0) : taughtTotal) - 1);

  let vocabNew = 0;
  let vocabReview = 0;
  let longestIsAnswer = 0;
  let choiceQuestions = 0;

  const seenVocab = new Set<string>();

  for (const [i, q] of file.questions.entries()) {
    const at = `question ${i + 1}`;

    // --- options, whatever the question is about ----------------------
    let options: string[] = [];
    let correct = "";

    if (q.kind === "vocab") {
      const word = vocabById.get(q.vocabId);
      const assignedIn = assignedWeek.get(q.vocabId);

      if (assignedIn === undefined) {
        err(
          `${at}: "${q.vocabId}"${word ? ` (${word.korean})` : ""} has not been assigned by week ${file.weekNumber}. Testing an unassigned word makes the score meaningless.`,
        );
      } else if (assignedIn === file.weekNumber) vocabNew++;
      else vocabReview++;

      if (seenVocab.has(q.vocabId)) {
        warn(`${at}: ${q.vocabId} is asked more than once on this test.`);
      }
      seenVocab.add(q.vocabId);

      // --- distractors ------------------------------------------------
      const wanted = Math.min(CHOICE_COUNT - 1, availableFor(word?.partOfSpeech ?? null));
      if (q.distractorIds.length !== wanted) {
        err(
          `${at}: needs ${wanted} distractor${wanted === 1 ? "" : "s"}, has ${q.distractorIds.length}.` +
            (wanted < CHOICE_COUNT - 1
              ? ` Only ${wanted} ${word?.partOfSpeech ?? "word"} option${wanted === 1 ? " has" : "s have"} been taught by week ${file.weekNumber}.`
              : ""),
        );
      }
      if (wanted < CHOICE_COUNT - 1) {
        warn(
          `${at}: ${wanted + 1} options rather than ${CHOICE_COUNT} — that is everything of this kind taught so far, so guessing pays better here.`,
        );
      }
      if (q.distractorIds.includes(q.vocabId)) {
        err(`${at}: the answer is also listed as a distractor.`);
      }
      if (new Set(q.distractorIds).size !== q.distractorIds.length) {
        err(`${at}: the same distractor is listed twice.`);
      }

      const distractors = q.distractorIds
        .map((id) => vocabById.get(id))
        .filter((w): w is VocabRow => !!w);

      for (const d of distractors) {
        if (assignedWeek.get(d.id) === undefined) {
          err(
            `${at}: distractor "${d.id}" (${d.korean}) has not been taught by week ${file.weekNumber}. A word nobody has met is eliminated on sight.`,
          );
        }
        // The cheapest tell of all: one verb among five particles.
        if (
          word?.partOfSpeech &&
          d.partOfSpeech &&
          d.partOfSpeech !== word.partOfSpeech
        ) {
          err(
            `${at}: distractor "${d.korean}" is a ${d.partOfSpeech} but the answer is a ${word.partOfSpeech}. Options of a different kind can be ruled out without knowing the word.`,
          );
        }
      }

      if (word) {
        correct = optionFor(q.format, word);
        options = [correct, ...distractors.map((d) => optionFor(q.format, d))];
      }
    }

    if (q.kind === "grammar") {
      const g = grammarById.get(q.grammarId);
      if (!assignedGrammar.has(q.grammarId) && g) {
        err(
          `${at}: grammar "${q.grammarId}" has not been assigned by week ${file.weekNumber}.`,
        );
      }
      const wantedG = Math.min(CHOICE_COUNT - 1, Math.max(0, assignedGrammar.size - 1));
      if (q.distractorIds.length !== wantedG) {
        err(
          `${at}: needs ${wantedG} distractor${wantedG === 1 ? "" : "s"}, has ${q.distractorIds.length}.` +
            (wantedG < CHOICE_COUNT - 1
              ? ` Only ${assignedGrammar.size} patterns have been taught by week ${file.weekNumber}.`
              : ""),
        );
      }
      if (wantedG < CHOICE_COUNT - 1) {
        warn(
          `${at}: ${wantedG + 1} options rather than ${CHOICE_COUNT} — only ${assignedGrammar.size} patterns have been taught.`,
        );
      }
      if (q.distractorIds.includes(q.grammarId)) {
        err(`${at}: the answer is also listed as a distractor.`);
      }
      if (new Set(q.distractorIds).size !== q.distractorIds.length) {
        err(`${at}: the same distractor is listed twice.`);
      }
      for (const id of q.distractorIds) {
        if (!assignedGrammar.has(id) && grammarById.has(id)) {
          err(
            `${at}: distractor grammar "${id}" has not been taught by week ${file.weekNumber}.`,
          );
        }
      }
      const distractors = q.distractorIds
        .map((id) => grammarById.get(id))
        .filter((x): x is GrammarRow => !!x);
      if (g) {
        correct = g.name;
        options = [g.name, ...distractors.map((d) => d.name)];
      }
    }

    if (q.kind === "reading") {
      if (!q.prompt.trim()) err(`${at}: reading question has no prompt.`);
      if (q.choices.length !== CHOICE_COUNT) {
        err(
          `${at}: needs exactly ${CHOICE_COUNT} options, has ${q.choices.length}.`,
        );
      }
      if (!q.choices.includes(q.correctAnswer)) {
        err(`${at}: correctAnswer "${q.correctAnswer}" is not one of the choices.`);
      }
      if (q.targetsVocabId && !vocabById.has(q.targetsVocabId)) {
        err(`${at}: targetsVocabId "${q.targetsVocabId}" is not in the corpus.`);
      }
      correct = q.correctAnswer;
      options = q.choices;
    }

    // --- rules that apply to every set of options ---------------------
    if (options.length > 1) {
      choiceQuestions++;

      const normalised = options.map((o) => o.trim().toLowerCase());
      if (new Set(normalised).size !== normalised.length) {
        err(
          `${at}: two options read the same, so both must be wrong — that removes one guess for free.`,
        );
      }

      const longest = Math.max(...options.map((o) => o.length));
      if (correct.length === longest && options.filter((o) => o.length === longest).length === 1) {
        longestIsAnswer++;
      }

      const outlier = lengthOutlier(options, correct);
      if (outlier === "long") {
        warn(
          `${at}: the answer is much longer than its options, which is findable without reading them.`,
        );
      } else if (outlier === "short") {
        warn(`${at}: the answer is much shorter than its options.`);
      }
    }
  }

  // --- test-wide shape -------------------------------------------------
  const longestIsAnswerPct = choiceQuestions
    ? Math.round((longestIsAnswer / choiceQuestions) * 100)
    : 0;
  if (choiceQuestions >= 20 && longestIsAnswer / choiceQuestions > LONGEST_RATE_LIMIT) {
    err(
      `The answer is the longest option on ${longestIsAnswerPct}% of questions; chance is ${Math.round(100 / CHOICE_COUNT)}%. Picking the longest option would pass this test without reading it.`,
    );
  }

  const readingQs = file.questions.filter((q) => q.kind === "reading");
  if (readingQs.length > 0 && !file.passage?.ko?.trim()) {
    err("There are reading questions but no passage.");
  }
  if (file.passage?.ko && readingQs.length === 0) {
    warn("A passage is included but nothing asks about it.");
  }

  const grammarCount = file.questions.filter((q) => q.kind === "grammar").length;
  const vocabCount = vocabNew + vocabReview;
  const reviewSharePct = vocabCount
    ? Math.round((vocabReview / vocabCount) * 100)
    : 0;

  if (settings) {
    if (vocabCount !== settings.testVocabCount) {
      warn(
        `${vocabCount} vocabulary questions; the class setting is ${settings.testVocabCount}.`,
      );
    }
    if (grammarCount !== settings.testGrammarCount) {
      warn(
        `${grammarCount} grammar questions; the class setting is ${settings.testGrammarCount}.`,
      );
    }
    if (
      file.weekNumber > 1 &&
      Math.abs(reviewSharePct - settings.testReviewShare) > 15
    ) {
      warn(
        `${reviewSharePct}% of the vocabulary is review; the class setting is ${settings.testReviewShare}%. Retention is measured on repeats, so too few weakens that figure.`,
      );
    }
    if (file.weekNumber > 1 && vocabReview === 0) {
      err(
        "No words from earlier weeks. Retention is computed from words seen on a previous test, so a test with no repeats contributes nothing to it.",
      );
    }
  }

  const readingScoreOnly = readingQs.filter((q) => !q.targetsVocabId).length;
  if (readingScoreOnly > 0) {
    warn(
      `${readingScoreOnly} reading question${readingScoreOnly === 1 ? "" : "s"} target no corpus word, so they count toward the score but not toward studied, verified or retention.`,
    );
  }

  return {
    ok: !findings.some((f) => f.level === "error"),
    findings,
    summary: {
      weekNumber: file.weekNumber,
      total: file.questions.length,
      vocabNew,
      vocabReview,
      grammar: grammarCount,
      reading: readingQs.length,
      readingScoreOnly,
      reviewSharePct,
      longestIsAnswerPct,
    },
  };
}

export type ImportResult = {
  testId: string;
  replaced: boolean;
  summary: ValidationReport["summary"];
};

/**
 * Writes a validated file into the database.
 *
 * Refuses if anyone has already started the existing test for that week —
 * replacing it would strand their attempt and orphan their answers.
 */
export async function applyTestFile(file: WeekTestFile): Promise<ImportResult> {
  const report = await validateTestFile(file);
  if (!report.ok) {
    throw new Error(
      "Refusing to import: " +
        report.findings
          .filter((f) => f.level === "error")
          .map((f) => f.message)
          .join(" "),
    );
  }

  const [settings] = await db.select().from(classSettings).limit(1);
  const [plan] = await db
    .select()
    .from(weekPlans)
    .where(eq(weekPlans.weekNumber, file.weekNumber))
    .limit(1);

  const [existing] = await db
    .select()
    .from(tests)
    .where(eq(tests.weekPlanId, plan.id))
    .limit(1);

  let replaced = false;
  if (existing) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(attempts)
      .where(eq(attempts.testId, existing.id));
    if (n > 0) {
      throw new Error(
        `Week ${file.weekNumber} already has a test that ${n} student${n === 1 ? " has" : "s have"} started. Importing would delete their answers.`,
      );
    }
    await db.delete(tests).where(eq(tests.id, existing.id));
    replaced = true;
  }

  const vocabIds = file.questions.flatMap((q) =>
    q.kind === "vocab"
      ? [q.vocabId, ...q.distractorIds]
      : q.kind === "reading" && q.targetsVocabId
        ? [q.targetsVocabId]
        : [],
  );
  const grammarIds = file.questions.flatMap((q) =>
    q.kind === "grammar" ? [q.grammarId, ...q.distractorIds] : [],
  );

  const vocabById = new Map(
    (vocabIds.length
      ? await db.select().from(corpusVocab).where(inArray(corpusVocab.id, vocabIds))
      : []
    ).map((v) => [v.id, v]),
  );
  const grammarById = new Map(
    (grammarIds.length
      ? await db
          .select()
          .from(corpusGrammar)
          .where(inArray(corpusGrammar.id, grammarIds))
      : []
    ).map((g) => [g.id, g]),
  );

  const [test] = await db
    .insert(tests)
    .values({
      weekPlanId: plan.id,
      title: file.title ?? `Week ${file.weekNumber} test`,
      status: "draft",
      passageKo: file.passage?.ko ?? null,
      passageEn: file.passage?.en ?? null,
      timeLimitMinutes:
        file.timeLimitMinutes ?? settings?.testTimeLimitMinutes ?? 30,
      spec: {
        source: "imported",
        ...report.summary,
        importedAt: new Date().toISOString(),
      },
    })
    .returning();

  // Answer position is decided here rather than in the file: balanced across
  // the whole test, and stable for a given week so a re-import of an unchanged
  // file produces the test the teacher already read.
  const slots = answerSlots(file.questions.length, file.weekNumber * 7919);
  const rand = seededRandom(file.weekNumber * 104729);

  await db.insert(questions).values(
    file.questions.map((q, i) => {
      const position = i + 1;
      const slot = slots[i] ?? 0;

      /** Places the answer at its assigned slot, distractors around it. */
      const lay = (correct: string, wrong: string[]) => {
        const rest = shuffled(wrong, rand);
        const out = [...rest];
        out.splice(Math.min(slot, rest.length), 0, correct);
        return out;
      };

      if (q.kind === "vocab") {
        const w = vocabById.get(q.vocabId)!;
        const distractors = q.distractorIds.map((id) => vocabById.get(id)!);
        const correct = optionFor(q.format, w);
        return {
          testId: test.id,
          kind: "vocab" as const,
          vocabId: w.id,
          format: q.format,
          section: "vocabulary",
          position,
          // Derived from the corpus, never copied from the file.
          prompt: q.format === "en_to_ko_choice" ? w.english : w.korean,
          choices: lay(correct, distractors.map((d) => optionFor(q.format, d))),
          distractorIds: q.distractorIds,
          correctAnswer: correct,
          acceptedAnswers: [correct],
        };
      }

      if (q.kind === "grammar") {
        const g = grammarById.get(q.grammarId)!;
        const distractors = q.distractorIds.map((id) => grammarById.get(id)!);
        return {
          testId: test.id,
          kind: "grammar" as const,
          grammarId: g.id,
          format: "grammar_choice" as const,
          section: "grammar",
          position,
          prompt: `What does ${g.form} express?`,
          choices: lay(g.name, distractors.map((d) => d.name)),
          distractorIds: q.distractorIds,
          correctAnswer: g.name,
          acceptedAnswers: [g.name],
        };
      }

      return {
        testId: test.id,
        kind: "vocab" as const,
        // Linked only when the question really turns on one word; otherwise
        // null, so it scores without polluting that word's mastery.
        vocabId: q.targetsVocabId ?? null,
        format: "reading_choice" as const,
        section: "reading",
        position,
        prompt: q.prompt,
        // Authored options: there is no corpus entry to build them from, so
        // the order is the author's and is left alone.
        choices: q.choices,
        distractorIds: null,
        correctAnswer: q.correctAnswer,
        acceptedAnswers: [q.correctAnswer],
      };
    }),
  );

  return { testId: test.id, replaced, summary: report.summary };
}

/**
 * Re-checks a test already in the database, against the rules the importer
 * enforces on a file.
 *
 * Validating a file and validating what was stored are not the same question.
 * The corpus can move after an import — a gloss edited, an entry removed — and
 * the decision to publish is taken in the preview, days later, not at the
 * moment of import. Rather than write a second set of rules that drifts from
 * the first, this rebuilds the file from the rows and runs the one validator.
 */
export async function auditTest(testId: string): Promise<ValidationReport> {
  const [row] = await db
    .select({ test: tests, weekNumber: weekPlans.weekNumber })
    .from(tests)
    .innerJoin(weekPlans, eq(weekPlans.id, tests.weekPlanId))
    .where(eq(tests.id, testId))
    .limit(1);
  if (!row) throw new Error("No such test.");

  const stored = await db
    .select()
    .from(questions)
    .where(eq(questions.testId, testId))
    .orderBy(asc(questions.position));

  // A question whose corpus row was deleted keeps its text and still scores,
  // but feeds nothing. The rebuild cannot express that, so it is reported here.
  const broken: Finding[] = [];
  const rebuilt: ImportedQuestion[] = [];

  for (const q of stored) {
    if (q.section === "reading") {
      rebuilt.push({
        kind: "reading",
        prompt: q.prompt,
        choices: q.choices ?? [],
        correctAnswer: q.correctAnswer,
        ...(q.vocabId ? { targetsVocabId: q.vocabId } : {}),
      });
      continue;
    }
    if (q.kind === "grammar") {
      if (!q.grammarId) {
        broken.push({
          level: "error",
          message: `Question ${q.position} has lost its grammar link — the pattern it tested is no longer in the corpus.`,
        });
        continue;
      }
      rebuilt.push({
        kind: "grammar",
        grammarId: q.grammarId,
        format: "grammar_choice",
        distractorIds: q.distractorIds ?? [],
      });
      continue;
    }
    if (!q.vocabId) {
      broken.push({
        level: "error",
        message: `Question ${q.position} ("${q.prompt}") has lost its vocabulary link — it would score but count toward no statistic.`,
      });
      continue;
    }
    if (q.format !== "vocab_choice" && q.format !== "en_to_ko_choice") {
      broken.push({
        level: "error",
        message: `Question ${q.position} is a ${q.format} question. Tests are multiple choice now, so this one predates the change and cannot be checked against the current rules.`,
      });
      continue;
    }
    rebuilt.push({
      kind: "vocab",
      vocabId: q.vocabId,
      format: q.format,
      distractorIds: q.distractorIds ?? [],
    });
  }

  const report = await validateTestFile({
    weekNumber: row.weekNumber,
    title: row.test.title,
    timeLimitMinutes: row.test.timeLimitMinutes,
    passage: row.test.passageKo
      ? { ko: row.test.passageKo, en: row.test.passageEn ?? "" }
      : undefined,
    questions: rebuilt,
  });

  return {
    ...report,
    ok: report.ok && !broken.some((f) => f.level === "error"),
    findings: [...broken, ...report.findings],
  };
}

/** Everything needed to write a week's test, for pasting into a conversation. */
export async function weekBrief(weekNumber: number) {
  const [settings] = await db.select().from(classSettings).limit(1);
  const [plan] = await db
    .select()
    .from(weekPlans)
    .where(eq(weekPlans.weekNumber, weekNumber))
    .limit(1);
  if (!plan) throw new Error(`No plan for week ${weekNumber}.`);

  const thisWeek = await db
    .select({
      id: corpusVocab.id,
      korean: corpusVocab.korean,
      english: corpusVocab.english,
      partOfSpeech: corpusVocab.partOfSpeech,
      studyDay: weekPlanVocab.studyDay,
    })
    .from(weekPlanVocab)
    .innerJoin(corpusVocab, eq(corpusVocab.id, weekPlanVocab.vocabId))
    .where(eq(weekPlanVocab.weekPlanId, plan.id))
    .orderBy(asc(weekPlanVocab.studyDay), asc(corpusVocab.korean));

  const grammar = await db
    .select({
      id: corpusGrammar.id,
      form: corpusGrammar.form,
      name: corpusGrammar.name,
      meaning: corpusGrammar.meaning,
    })
    .from(weekPlanGrammar)
    .innerJoin(corpusGrammar, eq(corpusGrammar.id, weekPlanGrammar.grammarId))
    .where(eq(weekPlanGrammar.weekPlanId, plan.id));

  // Review candidates: words the class has been tested on and most often got
  // wrong, so the passage can put them back in front of everyone.
  const weak = await db
    .select({
      id: corpusVocab.id,
      korean: corpusVocab.korean,
      english: corpusVocab.english,
      asked: sql<number>`count(*)::int`,
      wrong: sql<number>`count(*) filter (where not r.is_correct)::int`,
    })
    .from(sql`responses r`)
    .innerJoin(corpusVocab, sql`${corpusVocab.id} = r.vocab_id`)
    .groupBy(corpusVocab.id, corpusVocab.korean, corpusVocab.english)
    .having(sql`count(*) >= 2 and count(*) filter (where not r.is_correct) > 0`)
    .orderBy(sql`count(*) filter (where not r.is_correct)::float / count(*) desc`)
    .limit(20);

  const earlier = await db
    .select({
      id: corpusVocab.id,
      korean: corpusVocab.korean,
      english: corpusVocab.english,
      weekNumber: weekPlans.weekNumber,
    })
    .from(weekPlanVocab)
    .innerJoin(weekPlans, eq(weekPlans.id, weekPlanVocab.weekPlanId))
    .innerJoin(corpusVocab, eq(corpusVocab.id, weekPlanVocab.vocabId))
    .where(sql`${weekPlans.weekNumber} < ${weekNumber}`)
    .orderBy(asc(weekPlans.weekNumber));

  return { settings, plan, thisWeek, grammar, weak, earlier };
}

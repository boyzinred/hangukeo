/**
 * Turns the corpus into a semester: which words and grammar points land in
 * which week, and which study day inside that week.
 *
 * Assignment is uniform across the cohort — everyone gets the same batch — so
 * a plan is class-level and a student's bank is every plan up to today.
 */

export type PlannableVocab = {
  id: string;
  level: number;
  /** Study-day slot from the TOPIK 2000 list; null for shared-vocab additions. */
  sourceDay: number | null;
  partOfSpeech: string | null;
};

export type PlannableGrammar = {
  id: string;
  level: number;
};

export type WeekSpec = {
  weekNumber: number;
  weekKey: string;
  startsOn: Date;
  endsOn: Date;
  vocab: { id: string; studyDay: number }[];
  grammar: string[];
};

/** ISO week key, e.g. "2026-W38" — what weekly reports group on. */
export function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Thursday of the current week decides the year, per ISO 8601.
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

export function weeksBetween(start: Date, end: Date): number {
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (7 * 86400000)));
}

/**
 * Orders vocabulary for the semester: level first, then the curated day
 * sequence within a level.
 *
 * Level has to come first. The TOPIK 2000 list interleaves levels inside its
 * day ordering, so following that sequence alone opens week 1 with 갈등
 * (conflict) and 경제 (economy) — level-2 abstractions — while 물 and 먹다 wait
 * until December. Within a level the curated day order is kept, since it
 * already groups words sensibly.
 */
function orderVocab(pool: PlannableVocab[]): PlannableVocab[] {
  return [...pool].sort(
    (a, b) =>
      a.level - b.level ||
      // Words with a curated slot lead; shared-vocab extras follow.
      (a.sourceDay ?? Infinity) - (b.sourceDay ?? Infinity) ||
      a.id.localeCompare(b.id),
  );
}

/** Grammar runs easiest-first: all of TOPIK I, then level 3. */
function orderGrammar(pool: PlannableGrammar[]): PlannableGrammar[] {
  return [...pool].sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
}

export function buildSemesterPlan(opts: {
  termStart: Date;
  termEnd: Date;
  vocabPerWeek: number;
  grammarPerWeek: number;
  studyDaysPerWeek: number;
  vocab: PlannableVocab[];
  grammar: PlannableGrammar[];
}): WeekSpec[] {
  const totalWeeks = weeksBetween(opts.termStart, opts.termEnd);
  const vocabQueue = orderVocab(opts.vocab);
  const grammarQueue = orderGrammar(opts.grammar);

  const weeks: WeekSpec[] = [];
  let vi = 0;
  let gi = 0;

  for (let w = 0; w < totalWeeks; w++) {
    const startsOn = addDays(opts.termStart, w * 7);
    const endsOn = addDays(startsOn, 6);

    const batch = vocabQueue.slice(vi, vi + opts.vocabPerWeek);
    vi += batch.length;

    // Deal the batch round-robin across study days so each day gets a mix of
    // parts of speech rather than 20 consecutive nouns.
    const vocab = batch.map((v, i) => ({
      id: v.id,
      studyDay: (i % opts.studyDaysPerWeek) + 1,
    }));

    const grammar = grammarQueue
      .slice(gi, gi + opts.grammarPerWeek)
      .map((g) => g.id);
    gi += grammar.length;

    if (vocab.length === 0 && grammar.length === 0) break;

    weeks.push({
      weekNumber: w + 1,
      weekKey: isoWeekKey(startsOn),
      startsOn,
      endsOn,
      vocab,
      grammar,
    });
  }

  return weeks;
}

/**
 * The review schedule from the existing TOPIK word bank: alongside today's new
 * batch, re-drill the days 1, 3, 7 and 16 back. Recall is what fails first, so
 * review runs English → Korean while new material runs Korean → English.
 */
export const REVIEW_OFFSETS = [1, 3, 7, 16] as const;

export function reviewDayNumbers(currentDay: number): number[] {
  return REVIEW_OFFSETS.map((o) => currentDay - o).filter((d) => d >= 1);
}

/** Absolute study-day index across the semester, 1-based. */
export function absoluteDay(weekNumber: number, studyDay: number, daysPerWeek: number) {
  return (weekNumber - 1) * daysPerWeek + studyDay;
}

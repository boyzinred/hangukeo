/**
 * Bank types and pure grouping helpers.
 *
 * Deliberately free of any database import: this module is reached from client
 * components, and anything it touches ends up in the browser bundle.
 * The queries live in `bank.ts`, which is server-only.
 */

export type BankWord = {
  id: string;
  korean: string;
  english: string;
  acceptedAnswers: string[];
  partOfSpeech: string | null;
  topic: string | null;
  weekNumber: number;
  studyDay: number;
};

export type BankGrammar = {
  id: string;
  form: string;
  name: string;
  meaning: string;
  shape: string | null;
  level: number;
  examples: { ko: string; en: string }[];
  weekNumber: number;
};

/** Which semester week a date falls in, clamped to the planned range. */
export function weekNumberFor(
  today: Date,
  termStart: string,
  totalWeeks: number,
): number {
  const start = new Date(`${termStart}T00:00:00Z`);
  const days = Math.floor((today.getTime() - start.getTime()) / 86400000);
  return Math.min(Math.max(1, Math.floor(days / 7) + 1), totalWeeks);
}

/** Display order for the part-of-speech sections, matching the reference bank. */
export const POS_ORDER = [
  "pronoun", "determiner", "numeral", "counter", "dependent noun",
  "particle", "conjunction", "interjection", "noun", "proper noun",
  "noun phrase", "verb", "auxiliary verb", "adjective", "adverb",
  "expression", "phrase",
];

export const POS_LABELS: Record<string, { label: string; korean: string }> = {
  pronoun: { label: "Pronouns", korean: "대명사" },
  determiner: { label: "Determiners", korean: "관형사" },
  numeral: { label: "Numbers", korean: "수사" },
  counter: { label: "Counters", korean: "단위 명사" },
  "dependent noun": { label: "Dependent nouns", korean: "의존 명사" },
  particle: { label: "Particles", korean: "조사" },
  conjunction: { label: "Conjunctions", korean: "접속사" },
  interjection: { label: "Interjections", korean: "감탄사" },
  noun: { label: "Nouns", korean: "명사" },
  "proper noun": { label: "Proper nouns", korean: "고유 명사" },
  "noun phrase": { label: "Noun phrases", korean: "명사구" },
  verb: { label: "Action verbs", korean: "동사" },
  "auxiliary verb": { label: "Auxiliary verbs", korean: "보조 용언" },
  adjective: { label: "Descriptive verbs", korean: "형용사" },
  adverb: { label: "Adverbs", korean: "부사" },
  expression: { label: "Set expressions", korean: "관용 표현" },
  phrase: { label: "Collocations", korean: "연어" },
};

export function groupByPos(words: BankWord[]) {
  const map = new Map<string, BankWord[]>();
  for (const w of words) {
    const key = w.partOfSpeech ?? "noun";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(w);
  }
  return POS_ORDER.filter((p) => map.has(p)).map((p) => ({
    key: p,
    ...POS_LABELS[p],
    words: map.get(p)!.sort((a, b) => a.korean.localeCompare(b.korean, "ko")),
  }));
}

export function groupByWeekDay(words: BankWord[]) {
  const map = new Map<string, BankWord[]>();
  for (const w of words) {
    const key = `${w.weekNumber}:${w.studyDay}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(w);
  }
  return [...map.entries()]
    .map(([key, words]) => {
      const [week, day] = key.split(":").map(Number);
      return { key, week, day, words };
    })
    .sort((a, b) => a.week - b.week || a.day - b.day);
}

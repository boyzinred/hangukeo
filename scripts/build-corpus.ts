/**
 * Builds the single merged corpus this site runs on, from the source material
 * in the sibling `korean` repository.
 *
 *   vocab   topik-vocab-2000.js  +  shared-vocab.json (TOPIK levels 1-2)
 *   grammar tutoring-topik-i-grammar.html (32)  +  ...level-3-grammar.html (20)
 *
 * Romanization is dropped: this site is strictly Korean/English.
 *
 * Output is committed JSON, so the app never reads the korean repo at runtime.
 * Re-run with `npm run build:corpus` when the sources change.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

/** Evaluates a UMD file and returns its module.exports, without touching the loader. */
function loadUmd<T>(file: string): T {
  const mod = { exports: {} as T };
  new Function("module", "exports", "self", "window", readFileSync(file, "utf8"))(
    mod,
    mod.exports,
    {},
    {},
  );
  return mod.exports;
}

function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

const KOREAN_REPO =
  process.env.KOREAN_REPO ?? path.resolve("../korean");
const SHARED = path.join(KOREAN_REPO, "shared-vocab");
const OUT = path.resolve("src/corpus/data");

const MAX_LEVEL = 2; // TOPIK I

// ---------------------------------------------------------------- taxonomy

/** The 17 groups the word-bank reference uses; a superset of the PDF's 14. */
const POS_GROUPS = [
  "pronoun", "determiner", "numeral", "counter", "dependent noun",
  "particle", "conjunction", "interjection", "noun", "proper noun",
  "noun phrase", "verb", "auxiliary verb", "adjective", "adverb",
  "expression", "phrase",
] as const;
type Pos = (typeof POS_GROUPS)[number];

const POS_ALIASES: Record<string, Pos> = {
  "counter phrase": "counter",
  "noun/adverb": "noun",
  "noun/numeral": "numeral",
  "noun/adjective": "noun",
  "determiner/pronoun": "determiner",
  "adverb/pronoun": "adverb",
};

function normalisePos(raw: string | undefined): Pos | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if ((POS_GROUPS as readonly string[]).includes(v)) return v as Pos;
  if (POS_ALIASES[v]) return POS_ALIASES[v];
  const first = v.split("/")[0].trim();
  return (POS_GROUPS as readonly string[]).includes(first) ? (first as Pos) : null;
}

// ------------------------------------------------------------ gloss merging

const STOP = new Set(["to", "a", "an", "the", "or", "and", "be", "of", "is"]);

function contentTokens(gloss: string): Set<string> {
  return new Set(
    gloss
      .toLowerCase()
      .replace(/\([^)]*\)/g, " ")
      .split(/[^a-z0-9]+/)
      .filter((t) => t && !STOP.has(t)),
  );
}

/**
 * Two glosses for the same headword are the same word if they share any
 * content word. 개발하다 "to develop" / "to develop or exploit..." share
 * "develop"; 저 "that over there" / "I / me (polite)" share nothing, so they
 * are homographs and stay as separate entries.
 */
function sameWord(a: string, b: string): boolean {
  const ta = contentTokens(a);
  const tb = contentTokens(b);
  for (const t of ta) if (tb.has(t)) return true;
  return false;
}

export type VocabEntry = {
  id: string;
  korean: string;
  english: string;
  /** Every gloss we have, used for typed-answer grading. */
  acceptedAnswers: string[];
  partOfSpeech: Pos | null;
  level: 1 | 2;
  topic: string | null;
  /** Study-day slot from the TOPIK 2000 list, when the word has one. */
  day: number | null;
  /** bab lesson ids this word appears in, from shared-vocab. */
  lessons: string[];
  posConflict?: { a: string; b: string };
};

function buildVocab() {
  const t2 = loadUmd<{
    WORDS: {
      korean: string; meaning: string; partOfSpeech: string;
      topic: string; level: number; day: number;
    }[];
  }>(path.join(SHARED, "topik-vocab-2000.js")).WORDS;

  const sv = loadJson<{
    korean: string; english: string; partOfSpeech: string;
    topikLevel: number; category: string; lessons?: string[];
  }[]>(path.join(SHARED, "shared-vocab.json"));

  // Keyed by korean; each bucket holds one or more distinct senses.
  const buckets = new Map<string, VocabEntry[]>();
  let nextId = 1;
  const conflicts: VocabEntry[] = [];

  function add(
    korean: string,
    english: string,
    pos: string | undefined,
    level: number,
    topic: string | null,
    day: number | null,
    lessons: string[],
  ) {
    if (level > MAX_LEVEL) return;
    const norm = normalisePos(pos);
    const list = buckets.get(korean) ?? [];

    const match = list.find((e) => sameWord(e.english, english));
    if (match) {
      // Same word, different phrasing — keep both glosses as accepted answers
      // and display the shorter one.
      if (!match.acceptedAnswers.includes(english)) {
        match.acceptedAnswers.push(english);
      }
      if (english.length < match.english.length) match.english = english;
      if (match.partOfSpeech && norm && match.partOfSpeech !== norm) {
        match.posConflict = { a: match.partOfSpeech, b: norm };
        if (!conflicts.includes(match)) conflicts.push(match);
      }
      match.partOfSpeech ??= norm;
      match.day ??= day;
      match.topic ??= topic;
      for (const l of lessons) if (!match.lessons.includes(l)) match.lessons.push(l);
      return;
    }

    list.push({
      id: `v${String(nextId++).padStart(4, "0")}`,
      korean,
      english,
      acceptedAnswers: [english],
      partOfSpeech: norm,
      level: level as 1 | 2,
      topic,
      day,
      lessons: [...lessons],
    });
    buckets.set(korean, list);
  }

  // TOPIK 2000 first — it is the curriculum spine and carries the day slots.
  for (const w of t2) {
    add(w.korean, w.meaning, w.partOfSpeech, w.level, w.topic, w.day, []);
  }
  for (const w of sv) {
    add(w.korean, w.english, w.partOfSpeech, w.topikLevel, w.category, null, w.lessons ?? []);
  }

  const entries = [...buckets.values()].flat();
  return { entries, conflicts };
}

// -------------------------------------------------------------- grammar

export type GrammarEntry = {
  id: string;
  form: string;
  name: string;
  meaning: string;
  /** How the pattern attaches — batchim rules and so on. */
  shape: string | null;
  level: 1 | 3;
  examples: { ko: string; en: string }[];
};

/** Extracts the first balanced [...] literal after a marker. */
function sliceArray(src: string, marker: string): string {
  const i = src.indexOf(marker);
  if (i === -1) throw new Error(`marker not found: ${marker}`);
  const start = src.indexOf("[", i);
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    if (src[j] === "[") depth++;
    else if (src[j] === "]") {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error(`unbalanced array after ${marker}`);
}

function buildGrammar(): GrammarEntry[] {
  const out: GrammarEntry[] = [];

  // TOPIK I — array-of-arrays: [id, form, name, meaning, shape, [[ko,en],...]]
  const topik1Src = readFileSync(
    path.join(KOREAN_REPO, "tutoring-topik-i-grammar.html"),
    "utf8",
  );
  const rows = eval(sliceArray(topik1Src, "const GRAMMAR_POINTS =")) as [
    string, string, string, string, string, [string, string][],
  ][];
  for (const [id, form, name, meaning, shape, examples] of rows) {
    out.push({
      id: `g1-${id}`,
      form,
      name,
      meaning,
      shape: shape || null,
      level: 1,
      examples: examples.map(([ko, en]) => ({ ko, en })),
    });
  }

  // TOPIK II level 3 — JSON objects.
  const l3Src = readFileSync(
    path.join(KOREAN_REPO, "tutoring-topik-ii-level-3-grammar.html"),
    "utf8",
  );
  const l3 = JSON.parse(sliceArray(l3Src, "const GRAMMAR_POINTS =")) as {
    id: string; form: string; title: string; meaning: string;
    shape?: string; usage?: string;
    examples?: ({ ko: string; en: string } | [string, string])[];
  }[];
  for (const p of l3) {
    out.push({
      id: `g3-${p.id}`,
      form: p.form,
      name: p.title,
      meaning: p.meaning,
      shape: p.shape ?? p.usage ?? null,
      level: 3,
      examples: (p.examples ?? []).map((e) =>
        Array.isArray(e) ? { ko: e[0], en: e[1] } : e,
      ),
    });
  }

  return out;
}

// ------------------------------------------------------------------ main

const { entries: vocab, conflicts } = buildVocab();
const grammar = buildGrammar();

mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, "vocab.json"), JSON.stringify(vocab, null, 1));
writeFileSync(path.join(OUT, "grammar.json"), JSON.stringify(grammar, null, 1));

const byLevel = (n: number) => vocab.filter((v) => v.level === n).length;
const byPos = vocab.reduce<Record<string, number>>((m, v) => {
  const k = v.partOfSpeech ?? "(untagged)";
  m[k] = (m[k] ?? 0) + 1;
  return m;
}, {});
const homographs = [...new Set(vocab.map((v) => v.korean))].filter(
  (k) => vocab.filter((v) => v.korean === k).length > 1,
);

console.log(`vocab: ${vocab.length}  (L1 ${byLevel(1)}, L2 ${byLevel(2)})`);
console.log(`  with a study day: ${vocab.filter((v) => v.day !== null).length}`);
console.log(`  multi-gloss:      ${vocab.filter((v) => v.acceptedAnswers.length > 1).length}`);
console.log(`  homograph heads:  ${homographs.length}  e.g. ${homographs.slice(0, 6).join(", ")}`);
console.log(`  untagged POS:     ${byPos["(untagged)"] ?? 0}`);
console.log(`  POS conflicts:    ${conflicts.length}`);
for (const c of conflicts.slice(0, 10)) {
  console.log(`      ${c.korean.padEnd(8)} ${c.posConflict!.a} vs ${c.posConflict!.b}  (${c.english})`);
}
console.log(
  `grammar: ${grammar.length}  (TOPIK I ${grammar.filter((g) => g.level === 1).length}, L3 ${grammar.filter((g) => g.level === 3).length})`,
);
console.log(`  with examples: ${grammar.filter((g) => g.examples.length > 0).length}`);
console.log(`\nwritten to ${OUT}`);

/**
 * Translation-drill logic, ported from the standalone practice page and
 * trimmed to this project's needs: no romanization, and the word pool comes
 * from the class word bank instead of a pasted list.
 */

export type QuizWord = {
  id: string;
  korean: string;
  english: string;
  /** Extra accepted spellings stored on the item (teacher-curated). */
  acceptedAnswers: string[];
};

export type Mode = "korean" | "english";
/** "mixed" randomises the direction per question rather than per run. */
export type Direction = "ko_to_en" | "en_to_ko" | "mixed";

export type Question = {
  word: QuizWord;
  questionMode: Mode;
  answerMode: Mode;
};

export function normalizeEnglish(text: string): string {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Korean is compared without spacing — 띄어쓰기 is not what is being tested. */
export function normalizeKorean(text: string): string {
  return String(text ?? "").replace(/\s+/g, "").trim();
}

export function normalizeByMode(value: string, mode: Mode): string {
  return mode === "english" ? normalizeEnglish(value) : normalizeKorean(value);
}

/**
 * "to be excellent, outstanding" accepts the whole gloss or any one piece, so a
 * word with several English meanings is not scored on word order.
 */
export function splitMeaning(meaning: string): string[] {
  const exact = String(meaning);
  const pieces = exact
    .split("/")
    .flatMap((part) => part.split(","))
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([exact, ...pieces])];
}

export function displayValue(word: QuizWord, mode: Mode): string {
  return mode === "english" ? word.english : word.korean;
}

export function answerValues(word: QuizWord, mode: Mode): string[] {
  if (mode === "english") {
    return [...new Set([...splitMeaning(word.english), ...word.acceptedAnswers])];
  }
  return [word.korean];
}

/**
 * Homographs share a prompt, so every word showing the same prompt contributes
 * an accepted answer — 차 prompted as "car" must also accept the reading a
 * student learned as "tea" if both are in the bank.
 */
export function acceptedAnswers(
  pool: QuizWord[],
  word: QuizWord,
  qMode: Mode,
  aMode: Mode,
): string[] {
  const prompt = normalizeByMode(displayValue(word, qMode), qMode);
  const matching = pool.filter(
    (other) => normalizeByMode(displayValue(other, qMode), qMode) === prompt,
  );
  return [
    ...new Set(
      (matching.length ? matching : [word]).flatMap((other) =>
        answerValues(other, aMode),
      ),
    ),
  ];
}

export function isCorrect(
  pool: QuizWord[],
  word: QuizWord,
  qMode: Mode,
  aMode: Mode,
  userText: string,
): boolean {
  const user = normalizeByMode(userText, aMode);
  if (!user) return false;
  return acceptedAnswers(pool, word, qMode, aMode).some(
    (ans) => normalizeByMode(ans, aMode) === user,
  );
}

export function answerDisplay(word: QuizWord, mode: Mode): string {
  return mode === "english" ? word.english : word.korean;
}

function shuffle<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Deals the pool out in a random order that keeps look-alike questions apart —
 * two words sharing a prompt, or sharing an expected answer.
 */
export function spacedOrder(
  questions: Question[],
  keysOf: (q: Question) => string[],
): Question[] {
  const buckets = new Map<string, { keys: string[]; items: Question[] }>();
  questions.forEach((q) => {
    const keys = keysOf(q);
    const id = keys[0];
    if (!buckets.has(id)) buckets.set(id, { keys, items: [] });
    buckets.get(id)!.items.push(q);
  });

  let ids = shuffle([...buckets.keys()]);
  const maxGap = Math.max(0, Math.min(ids.length - 1, 4));
  const out: Question[] = [];
  const recent: string[][] = [];

  while (out.length < questions.length) {
    let picked: string | null = null;
    // Widest gap first, then relax it until something is dealable; gap 0 has no
    // window, so the loop always finds a pick.
    for (let gap = maxGap; gap >= 0 && picked === null; gap--) {
      const blocked = new Set(gap > 0 ? recent.slice(-gap).flat() : []);
      const available = ids.filter(
        (id) => !buckets.get(id)!.keys.some((key) => blocked.has(key)),
      );
      if (!available.length) continue;
      const most = Math.max(...available.map((id) => buckets.get(id)!.items.length));
      const best = available.filter((id) => buckets.get(id)!.items.length === most);
      picked = best[Math.floor(Math.random() * best.length)];
    }
    if (picked === null) break;
    const bucket = buckets.get(picked)!;
    out.push(bucket.items.shift()!);
    recent.push(bucket.keys);
    if (!bucket.items.length) ids = ids.filter((id) => id !== picked);
  }
  return out;
}

function questionKeys(q: Question): string[] {
  return [
    `w:${normalizeKorean(q.word.korean)}`,
    `q:${normalizeByMode(displayValue(q.word, q.questionMode), q.questionMode)}`,
    `a:${normalizeByMode(answerDisplay(q.word, q.answerMode), q.answerMode)}`,
  ];
}

export function buildQuestions(
  pool: QuizWord[],
  direction: Direction,
  limit?: number,
): Question[] {
  const questions: Question[] = pool.map((word) => {
    const dir =
      direction === "mixed"
        ? Math.random() < 0.5
          ? "ko_to_en"
          : "en_to_ko"
        : direction;
    return dir === "ko_to_en"
      ? { word, questionMode: "korean", answerMode: "english" }
      : { word, questionMode: "english", answerMode: "korean" };
  });

  const ordered = spacedOrder(questions, questionKeys);
  return limit ? ordered.slice(0, limit) : ordered;
}

export const DIRECTION_LABELS: Record<Direction, string> = {
  ko_to_en: "Korean → English",
  en_to_ko: "English → Korean",
  mixed: "Mixed",
};

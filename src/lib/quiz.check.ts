/** Assertions over the drill logic. Run with `npm run check:quiz`. */
import {
  acceptedAnswers,
  buildQuestions,
  isCorrect,
  normalizeEnglish,
  normalizeKorean,
  splitMeaning,
  type QuizWord,
} from "./quiz";

let failures = 0;
function ok(label: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.log(`  FAIL  ${label}`);
  } else {
    console.log(`  ok    ${label}`);
  }
}

const w = (korean: string, english: string, accepted: string[] = []): QuizWord => ({
  id: korean,
  korean,
  english,
  acceptedAnswers: accepted,
});

const 학교 = w("학교", "school");
const 좋다 = w("좋다", "to be good", ["to be good", "good"]);
const 차_car = w("차", "car");
const 차_tea = w("차", "tea");
const 공부하다 = w("공부하다", "to study");
const pool = [학교, 좋다, 차_car, 차_tea, 공부하다];

console.log("normalisation");
ok("english lowercases and strips punctuation", normalizeEnglish("To Be Good!") === "to be good");
ok("english maps & to and", normalizeEnglish("salt & pepper") === "salt and pepper");
ok("korean strips spacing", normalizeKorean("공부 하다") === "공부하다");

console.log("\nmeaning splitting");
const pieces = splitMeaning("to be excellent, outstanding");
ok("keeps whole gloss", pieces.includes("to be excellent, outstanding"));
ok("accepts one piece", pieces.includes("outstanding"));

console.log("\ngrading");
ok("exact english", isCorrect(pool, 학교, "korean", "english", "school"));
ok("case-insensitive", isCorrect(pool, 학교, "korean", "english", "  SCHOOL "));
ok("curated alt accepted", isCorrect(pool, 좋다, "korean", "english", "good"));
ok("dictionary form accepted", isCorrect(pool, 좋다, "korean", "english", "to be good"));
ok("korean ignores spacing", isCorrect(pool, 공부하다, "english", "korean", "공부 하다"));
ok("wrong answer rejected", !isCorrect(pool, 학교, "korean", "english", "hospital"));
ok("empty answer rejected", !isCorrect(pool, 학교, "korean", "english", "   "));

console.log("\nhomographs");
const 차answers = acceptedAnswers(pool, 차_car, "korean", "english");
ok("차 prompt accepts car", 차answers.includes("car"));
ok("차 prompt accepts tea", 차answers.includes("tea"));
ok("차 → tea graded correct", isCorrect(pool, 차_car, "korean", "english", "tea"));
ok(
  "학교 does not inherit unrelated answers",
  !acceptedAnswers(pool, 학교, "korean", "english").includes("tea"),
);

console.log("\nquestion building");
const ko = buildQuestions(pool, "ko_to_en");
ok("ko_to_en prompts in korean", ko.every((q) => q.questionMode === "korean"));
ok("covers whole pool", ko.length === pool.length);
const en = buildQuestions(pool, "en_to_ko");
ok("en_to_ko prompts in english", en.every((q) => q.questionMode === "english"));
const limited = buildQuestions(pool, "mixed", 3);
ok("respects limit", limited.length === 3);

// Mixed should produce both directions across a large enough sample.
const big = Array.from({ length: 200 }, (_, i) => w(`단어${i}`, `word${i}`));
const mixed = buildQuestions(big, "mixed");
const koCount = mixed.filter((q) => q.questionMode === "korean").length;
ok("mixed uses both directions", koCount > 20 && koCount < 180);

console.log("\nspacing of look-alikes");
// 차/car and 차/tea share a prompt; they must not land next to each other.
let adjacentClashes = 0;
for (let run = 0; run < 200; run++) {
  const qs = buildQuestions(pool, "ko_to_en");
  for (let i = 1; i < qs.length; i++) {
    if (qs[i].word.korean === qs[i - 1].word.korean) adjacentClashes++;
  }
}
ok(`차 entries never adjacent over 200 runs (saw ${adjacentClashes})`, adjacentClashes === 0);

console.log(failures === 0 ? "\nall passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);

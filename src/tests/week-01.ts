import type { WeekTestFile } from "@/lib/test-import";

/**
 * Week 1 test.
 *
 * A sample rather than full coverage: 24 of the week's 145 words, five per
 * study day, which is the shape the class settings describe and what a normal
 * week looks like.
 *
 * No reading section. Week 1 teaches no nouns, verbs or adjectives — it is
 * greetings, particles, pronouns, counters and numerals — so any passage would
 * have to reach for words the class has not met, and a comprehension question
 * a student cannot read is not a test of comprehension. Reading starts once
 * there is something to build a sentence from.
 *
 * Grammar questions offer four options, not six: four patterns have been
 * taught, and a distractor nobody has seen is eliminated on sight. The
 * importer says so rather than quietly padding the list.
 *
 * Words are referred to by id. Prompts, answers and the wrong options are all
 * read from the corpus at import, so this file cannot disagree with the bank.
 */
const test: WeekTestFile = {
  weekNumber: 1,
  title: "Week 1 test",
  // 28 questions with four to six options each, at roughly half a minute
  // apiece for a first test.
  timeLimitMinutes: 20,

  questions: [

    // --- day 1 ---
    { kind: "vocab", vocabId: "v0007", format: "en_to_ko_choice", // 안녕하세요 · Hello
      distractorIds: ["v0057", "v0130", "v0379", "v0193", "v0180"] },
    { kind: "vocab", vocabId: "v0023", format: "vocab_choice", // 것 · thing, one
      distractorIds: ["v0474", "v0274", "v0324", "v0073", "v0374"] },
    { kind: "vocab", vocabId: "v0029", format: "en_to_ko_choice", // 잘 모르겠어요 · I do not really know
      distractorIds: ["v0328", "v0278", "v0428", "v0229", "v0079"] },
    { kind: "vocab", vocabId: "v0070", format: "vocab_choice", // 그 · that / he
      distractorIds: ["v0220", "v0170", "v0020", "v0120"] },
    { kind: "vocab", vocabId: "v0075", format: "vocab_choice", // 그러나 · but then
      distractorIds: ["v0025", "v0475", "v0375", "v0225", "v0325"] },

    // --- day 2 ---
    { kind: "vocab", vocabId: "v0019", format: "vocab_choice", // 저 · I, humble
      distractorIds: ["v0371", "v0421", "v0321", "v0069", "v0271"] },
    { kind: "vocab", vocabId: "v0024", format: "vocab_choice", // 은 · topic marker
      distractorIds: ["v0340", "v0174", "v0461", "v0074", "v0390"] },
    { kind: "vocab", vocabId: "v0030", format: "en_to_ko_choice", // 안녕히 가세요 · Goodbye, to someone leaving
      distractorIds: ["v0308", "v0130", "v0143", "v0093", "v0007"] },
    { kind: "vocab", vocabId: "v0071", format: "vocab_choice", // 둘 · two, native
      distractorIds: ["v0322", "v0221", "v0021", "v0171", "v0372"] },
    { kind: "vocab", vocabId: "v0076", format: "vocab_choice", // 예 · yes, formal
      distractorIds: ["v0226", "v0176", "v0026", "v0126"] },

    // --- day 3 ---
    { kind: "vocab", vocabId: "v0020", format: "vocab_choice", // 이 · this
      distractorIds: ["v0170", "v0070", "v0220", "v0120"] },
    { kind: "vocab", vocabId: "v0025", format: "vocab_choice", // 그리고 · and, joining sentences
      distractorIds: ["v0125", "v0075", "v0275", "v0375", "v0475"] },
    { kind: "vocab", vocabId: "v0043", format: "en_to_ko_choice", // 안녕히 계세요 · Goodbye, to someone staying
      distractorIds: ["v0243", "v0030", "v0107", "v0057", "v0458"] },
    { kind: "vocab", vocabId: "v0072", format: "vocab_choice", // 장 · one piece of sth flat
      distractorIds: ["v0273", "v0222", "v0373", "v0323", "v0172"] },
    { kind: "vocab", vocabId: "v0078", format: "en_to_ko_choice", // 대중교통 · public transportation
      distractorIds: ["v0228", "v0028", "v0377", "v0427", "v0128"] },

    // --- day 4 ---
    { kind: "vocab", vocabId: "v0021", format: "vocab_choice", // 하나 · one
      distractorIds: ["v0372", "v0171", "v0272", "v0422", "v0221"] },
    { kind: "vocab", vocabId: "v0026", format: "vocab_choice", // 네 · yes
      distractorIds: ["v0126", "v0226", "v0076", "v0176"] },
    { kind: "vocab", vocabId: "v0057", format: "en_to_ko_choice", // 감사합니다 · thank you
      distractorIds: ["v0458", "v0308", "v0293", "v0107", "v0007"] },
    { kind: "vocab", vocabId: "v0073", format: "vocab_choice", // 수 · ability / way
      distractorIds: ["v0424", "v0474", "v0173", "v0023", "v0374"] },
    { kind: "vocab", vocabId: "v0079", format: "en_to_ko_choice", // 다시 말해 주세요 · Please say that again
      distractorIds: ["v0029", "v0328", "v0428", "v0179", "v0129"] },

    // --- day 5 ---
    { kind: "vocab", vocabId: "v0022", format: "vocab_choice", // 개 · counter for objects
      distractorIds: ["v0072", "v0373", "v0222", "v0423", "v0273"] },
    { kind: "vocab", vocabId: "v0028", format: "en_to_ko_choice", // 자기소개 · self-introduction
      distractorIds: ["v0128", "v0327", "v0377", "v0427", "v0078"] },
    { kind: "vocab", vocabId: "v0069", format: "vocab_choice", // 나 · I, casual
      distractorIds: ["v0271", "v0471", "v0421", "v0119", "v0321"] },
    { kind: "vocab", vocabId: "v0074", format: "vocab_choice", // 이 · subject marker
      distractorIds: ["v0461", "v0390", "v0440", "v0361", "v0224"] },

    // --- grammar: all four patterns taught so far, as each other's options ---
    { kind: "grammar", grammarId: "g1-g1", format: "grammar_choice", // 은/는 · Topic particle
      distractorIds: ["g1-g10", "g1-g11", "g1-g12"] },
    { kind: "grammar", grammarId: "g1-g10", format: "grammar_choice", // -아/어/해요 · Present tense
      distractorIds: ["g1-g1", "g1-g11", "g1-g12"] },
    { kind: "grammar", grammarId: "g1-g11", format: "grammar_choice", // -았/었/했어요 · Past tense
      distractorIds: ["g1-g1", "g1-g10", "g1-g12"] },
    { kind: "grammar", grammarId: "g1-g12", format: "grammar_choice", // -(으)ㄹ 거예요 · Future tense
      distractorIds: ["g1-g1", "g1-g10", "g1-g11"] },  ],
};

export default test;

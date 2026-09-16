import type { WeekTestFile } from "@/lib/test-import";

/**
 * Week 3 test — full coverage, multiple choice.
 *
 * Every one of the 125 words week 3 assigned is asked, plus the 20 the class
 * gets wrong most often, so "studied" and "verified" can converge for the week
 * instead of verified trailing at a fifth of it. That is a deliberate
 * departure from the class settings, which describe a 24-word sample; the
 * importer warns about the count and the review share, and the warnings are
 * the point — they record that this test was meant to be different.
 *
 * Six options a question. Guessing gets you one in six rather than one in
 * four, which matters because "verified" needs two correct tests: a word the
 * student does not know comes out verified by luck under 3% of the time
 * instead of over 6%.
 *
 * Nothing here is typed. The wrong options are named by id, not written out,
 * so the importer reads their glosses from the corpus and the validator can
 * insist they are words already taught, of the same part of speech, and of
 * comparable length. Written as free text none of that would be checkable, and
 * a distractor of the wrong kind hands the answer to anyone paying attention.
 *
 * Direction follows the gloss. Where the English is a real equivalent —
 * expressions, phrases, noun phrases, proper nouns — the question shows the
 * English and offers Korean options. Where the gloss describes a function
 * ("counter for bottles", "subject marker, honorific") a Korean option list
 * would be guesswork, so it shows the Korean and offers English. That is 65
 * recall to 80 recognition.
 *
 * Option order is not in this file: the importer places the answer, balanced
 * across the test and stable for the week, so no slot is favoured and a
 * re-import of an unchanged file produces the test the teacher already read.
 *
 * Run `npm run test:brief -- --week 3` for the ids.
 */
const test: WeekTestFile = {
  weekNumber: 3,
  title: "Week 3 test — full coverage",
  // 149 questions with six options each. Reading and weighing six is slower
  // than recognising one, so about 25 seconds a question.
  timeLimitMinutes: 65,

  // Uses only words assigned by week 3, and leans on this week's four grammar
  // patterns: 이/가, -고, -아서/어서 and -지만.
  passage: {
    ko: [
      "새 학기가 시작되었어요. 저는 취업 준비를 하고 있어서 먼저 계획을 세웠어요.",
      "아침에 일찍 일어나고 자기 계발에 노력을 기울여요.",
      "시험을 보는 날에는 스트레스를 받지만 친구들이 힘내세요 하고 말해 줘요.",
      "그러다가 여러 회사에 관심을 갖게 되었어요.",
      "반면에 경험을 쌓는 것도 중요해서 작은 일부터 시작했어요.",
      "그뿐만 아니라 약속을 지키는 습관이 큰 도움이 되었어요.",
      "지난 주말에는 친구와 사진을 찍고 같이 시간을 보냈어요. 그 시간이 정말 마음에 들었어요.",
      "이제 결정을 내릴 때예요. 걱정하지 마세요.",
    ].join(" "),
    en: [
      "The new term has started. I am preparing to job hunt, so first I made a plan.",
      "I get up early in the morning and put effort into self-development.",
      "On days I take an exam I get stressed, but my friends tell me to hang in there.",
      "Then I came to take an interest in several companies.",
      "On the other hand, building up experience matters too, so I started with small jobs.",
      "Not only that, the habit of keeping promises has been a big help.",
      "Last weekend I took photos with a friend and spent time together. I really liked that time.",
      "Now it is time to make a decision. Do not worry.",
    ].join(" "),
  },

  questions: [

    // --- day 1 (25) ---
    { kind: "vocab", vocabId: "v0976", format: "en_to_ko_choice", // 중국 · China
      distractorIds: ["v0626", "v1125", "v1075", "v1026", "v1175"] },
    { kind: "vocab", vocabId: "v1010", format: "vocab_choice", // 으로써 · by means of, with
      distractorIds: ["v1139", "v0411", "v0311", "v1059", "v0790"] },
    { kind: "vocab", vocabId: "v1024", format: "vocab_choice", // 무렵 · around the time of
      distractorIds: ["v0274", "v0724", "v0424", "v0574", "v0774"] },
    { kind: "vocab", vocabId: "v1040", format: "vocab_choice", // 께서 · subject marker, honorific
      distractorIds: ["v0461", "v0411", "v0611", "v1089", "v1139"] },
    { kind: "vocab", vocabId: "v1071", format: "vocab_choice", // 사 · four
      distractorIds: ["v0822", "v0422", "v1271", "v0522", "v0672"] },
    { kind: "vocab", vocabId: "v1076", format: "en_to_ko_choice", // 주차 공간 · parking space
      distractorIds: ["v1126", "v0277", "v0927", "v1226", "v0977"] },
    { kind: "vocab", vocabId: "v1110", format: "en_to_ko_choice", // 아 오다 · to have been doing
      distractorIds: ["v0529", "v0508", "v0761", "v0007", "v0393"] },
    { kind: "vocab", vocabId: "v1124", format: "vocab_choice", // 아휴 · ugh, sigh
      distractorIds: ["v1025", "v0975", "v0126", "v1425", "v0076"] },
    { kind: "vocab", vocabId: "v1140", format: "en_to_ko_choice", // 춤을 추다 · to dance
      distractorIds: ["v0693", "v1011", "v0861", "v0130", "v0941"] },
    { kind: "vocab", vocabId: "v1172", format: "vocab_choice", // 층 · counter for floors of a building
      distractorIds: ["v0373", "v0523", "v1472", "v0923", "v0473"] },
    { kind: "vocab", vocabId: "v1177", format: "en_to_ko_choice", // 서두르지 마세요 · Do not rush
      distractorIds: ["v1360", "v0229", "v1289", "v0029", "v0778"] },
    { kind: "vocab", vocabId: "v1220", format: "vocab_choice", // 각 · each, before a noun
      distractorIds: ["v0220", "v1270", "v1320", "v0020", "v0170"] },
    { kind: "vocab", vocabId: "v1225", format: "en_to_ko_choice", // 호주 · Australia
      distractorIds: ["v0826", "v0676", "v0626", "v1125", "v0576"] },
    { kind: "vocab", vocabId: "v1257", format: "en_to_ko_choice", // 돈을 벌다 · to earn money
      distractorIds: ["v1140", "v0693", "v0543", "v0107", "v0643"] },
    { kind: "vocab", vocabId: "v1273", format: "vocab_choice", // 이든가 · or, whichever
      distractorIds: ["v0540", "v0640", "v0940", "v1059", "v0174"] },
    { kind: "vocab", vocabId: "v1289", format: "en_to_ko_choice", // 마음대로 하세요 · Do as you like
      distractorIds: ["v0728", "v0029", "v1260", "v0678", "v0129"] },
    { kind: "vocab", vocabId: "v1321", format: "vocab_choice", // 구 · nine
      distractorIds: ["v0171", "v1271", "v0272", "v1121", "v0872"] },
    { kind: "vocab", vocabId: "v1326", format: "en_to_ko_choice", // 러시아 · Russia
      distractorIds: ["v0426", "v0276", "v1075", "v1125", "v0376"] },
    { kind: "vocab", vocabId: "v1360", format: "en_to_ko_choice", // 조심히 가세요 · Get home safely
      distractorIds: ["v1077", "v1177", "v0229", "v0678", "v0778"] },
    { kind: "vocab", vocabId: "v1374", format: "vocab_choice", // 그러다가 · and then, in the middle of that
      distractorIds: ["v0675", "v0125", "v0425", "v1274", "v0475"] },
    { kind: "vocab", vocabId: "v1392", format: "en_to_ko_choice", // 계획을 세우다 · to make a plan
      distractorIds: ["v0608", "v1357", "v0308", "v0030", "v0157"] },
    { kind: "vocab", vocabId: "v1422", format: "vocab_choice", // 병 · counter for bottles
      distractorIds: ["v0172", "v0773", "v1372", "v0423", "v1072"] },
    { kind: "vocab", vocabId: "v1428", format: "en_to_ko_choice", // 영향을 미치다 · to have an influence on
      distractorIds: ["v0043", "v0258", "v0143", "v0458", "v0243"] },
    { kind: "vocab", vocabId: "v1470", format: "vocab_choice", // 헌 · worn, used
      distractorIds: ["v1420", "v0120", "v1370", "v1120", "v0170"] },
    { kind: "vocab", vocabId: "v1475", format: "vocab_choice", // 글쎄 · well, I'm not sure
      distractorIds: ["v1224", "v1425", "v0925", "v0226", "v1124"] },

    // --- day 2 (25) ---
    { kind: "vocab", vocabId: "v0977", format: "en_to_ko_choice", // 식사 예절 · table manners
      distractorIds: ["v0028", "v0178", "v0427", "v1226", "v0527"] },
    { kind: "vocab", vocabId: "v1011", format: "en_to_ko_choice", // 아 버리다 · to do completely, with regret
      distractorIds: ["v0443", "v0543", "v0180", "v1140", "v0708"] },
    { kind: "vocab", vocabId: "v1025", format: "vocab_choice", // 어머 · oh my, mainly female
      distractorIds: ["v1325", "v1074", "v1124", "v0975", "v0026"] },
    { kind: "vocab", vocabId: "v1041", format: "en_to_ko_choice", // 아 놓다 · to do and leave it done
      distractorIds: ["v0761", "v0429", "v0408", "v1090", "v0493"] },
    { kind: "vocab", vocabId: "v1072", format: "vocab_choice", // 편 · counter for films and poems
      distractorIds: ["v1272", "v1372", "v0773", "v0373", "v0873"] },
    { kind: "vocab", vocabId: "v1077", format: "en_to_ko_choice", // 걱정하지 마세요 · Do not worry
      distractorIds: ["v0678", "v1227", "v0029", "v0229", "v0878"] },
    { kind: "vocab", vocabId: "v1120", format: "vocab_choice", // 여러 · several
      distractorIds: ["v0220", "v1170", "v0020", "v1220", "v1370"] },
    { kind: "vocab", vocabId: "v1125", format: "en_to_ko_choice", // 프랑스 · France
      distractorIds: ["v1276", "v0826", "v0576", "v0726", "v1026"] },
    { kind: "vocab", vocabId: "v1159", format: "vocab_choice", // 으로부터 · from
      distractorIds: ["v0661", "v0440", "v0511", "v0540", "v0290"] },
    { kind: "vocab", vocabId: "v1173", format: "vocab_choice", // 마리 · number of animals
      distractorIds: ["v0724", "v0674", "v0274", "v1073", "v0173"] },
    { kind: "vocab", vocabId: "v1189", format: "vocab_choice", // 이야말로 · indeed, precisely
      distractorIds: ["v0640", "v1239", "v1089", "v0990", "v1139"] },
    { kind: "vocab", vocabId: "v1221", format: "vocab_choice", // 칠 · seven
      distractorIds: ["v0272", "v0171", "v0422", "v0372", "v0822"] },
    { kind: "vocab", vocabId: "v1226", format: "en_to_ko_choice", // 자기 계발 · self-development
      distractorIds: ["v0927", "v0577", "v0527", "v1176", "v0178"] },
    { kind: "vocab", vocabId: "v1260", format: "en_to_ko_choice", // 편하게 하세요 · Make yourself comfortable
      distractorIds: ["v0928", "v0728", "v1077", "v1460", "v0278"] },
    { kind: "vocab", vocabId: "v1274", format: "vocab_choice", // 반면에 · on the other hand
      distractorIds: ["v1424", "v1324", "v0075", "v1374", "v0275"] },
    { kind: "vocab", vocabId: "v1292", format: "en_to_ko_choice", // 사진을 찍다 · to take a photo
      distractorIds: ["v1160", "v1378", "v0911", "v1190", "v1210"] },
    { kind: "vocab", vocabId: "v1322", format: "vocab_choice", // 자리 · counter for seats and places
      distractorIds: ["v0122", "v1272", "v1072", "v1172", "v0473"] },
    { kind: "vocab", vocabId: "v1328", format: "en_to_ko_choice", // 노력을 기울이다 · to put in effort
      distractorIds: ["v0143", "v0157", "v1307", "v0608", "v0811"] },
    { kind: "vocab", vocabId: "v1370", format: "vocab_choice", // 새 · new
      distractorIds: ["v0070", "v0020", "v1070", "v0220", "v0120"] },
    { kind: "vocab", vocabId: "v1375", format: "vocab_choice", // 자 · now then, here you go
      distractorIds: ["v1475", "v0076", "v1275", "v0925", "v1025"] },
    { kind: "vocab", vocabId: "v1407", format: "en_to_ko_choice", // 결정을 내리다 · to make a decision
      distractorIds: ["v0258", "v0308", "v0329", "v0458", "v1307"] },
    { kind: "vocab", vocabId: "v1423", format: "vocab_choice", // 더러 · to a person, colloquial
      distractorIds: ["v0490", "v0990", "v1323", "v0174", "v1089"] },
    { kind: "vocab", vocabId: "v1439", format: "en_to_ko_choice", // 이쪽으로 오세요 · Please come this way
      distractorIds: ["v0328", "v1360", "v0928", "v0179", "v1289"] },
    { kind: "vocab", vocabId: "v1471", format: "vocab_choice", // 백 · hundred
      distractorIds: ["v0322", "v0672", "v0422", "v0021", "v0372"] },
    { kind: "vocab", vocabId: "v1476", format: "en_to_ko_choice", // 태국 · Thailand
      distractorIds: ["v0976", "v1175", "v1026", "v0876", "v0326"] },

    // --- day 3 (25) ---
    { kind: "vocab", vocabId: "v0978", format: "en_to_ko_choice", // 힘내세요 · Cheer up, hang in there
      distractorIds: ["v0928", "v0328", "v0528", "v0828", "v0728"] },
    { kind: "vocab", vocabId: "v1021", format: "vocab_choice", // 어떤 · what kind of
      distractorIds: ["v1220", "v0070", "v0170", "v1070", "v0020"] },
    { kind: "vocab", vocabId: "v1026", format: "en_to_ko_choice", // 일본 · Japan
      distractorIds: ["v0426", "v1125", "v0326", "v1175", "v0676"] },
    { kind: "vocab", vocabId: "v1059", format: "vocab_choice", // 이라고 · quoting particle
      distractorIds: ["v1010", "v0990", "v1473", "v0690", "v1109"] },
    { kind: "vocab", vocabId: "v1073", format: "vocab_choice", // 명 · person counter
      distractorIds: ["v0023", "v1024", "v0574", "v0424", "v0624"] },
    { kind: "vocab", vocabId: "v1089", format: "vocab_choice", // 요 · politeness particle
      distractorIds: ["v0411", "v0340", "v0174", "v0960", "v0711"] },
    { kind: "vocab", vocabId: "v1121", format: "vocab_choice", // 오 · five
      distractorIds: ["v0422", "v0171", "v0071", "v0121", "v0872"] },
    { kind: "vocab", vocabId: "v1126", format: "en_to_ko_choice", // 근무 환경 · working conditions
      distractorIds: ["v0527", "v0327", "v0927", "v1176", "v0178"] },
    { kind: "vocab", vocabId: "v1160", format: "en_to_ko_choice", // 경험을 쌓다 · to build up experience
      distractorIds: ["v1457", "v1492", "v1190", "v0629", "v1478"] },
    { kind: "vocab", vocabId: "v1174", format: "vocab_choice", // 에이 · come on, no way
      distractorIds: ["v0925", "v1375", "v0226", "v0076", "v0176"] },
    { kind: "vocab", vocabId: "v1190", format: "en_to_ko_choice", // 책임을 지다 · to take responsibility
      distractorIds: ["v0558", "v0479", "v0258", "v0007", "v0629"] },
    { kind: "vocab", vocabId: "v1222", format: "vocab_choice", // 칸 · counter for compartments and rooms
      distractorIds: ["v0773", "v0923", "v0122", "v1072", "v1322"] },
    { kind: "vocab", vocabId: "v1227", format: "en_to_ko_choice", // 부담 갖지 마세요 · Do not feel obliged
      distractorIds: ["v0728", "v0928", "v1177", "v1077", "v0229"] },
    { kind: "vocab", vocabId: "v1270", format: "vocab_choice", // 온갖 · all sorts of
      distractorIds: ["v1070", "v1120", "v0020", "v1470", "v0120"] },
    { kind: "vocab", vocabId: "v1275", format: "vocab_choice", // 여보세요 · telephone HELLO
      distractorIds: ["v0176", "v1475", "v1174", "v0975", "v1124"] },
    { kind: "vocab", vocabId: "v1307", format: "en_to_ko_choice", // 약속을 지키다 · to keep a promise
      distractorIds: ["v0258", "v1407", "v1240", "v0030", "v0143"] },
    { kind: "vocab", vocabId: "v1323", format: "vocab_choice", // 하며 · and, listing, spoken
      distractorIds: ["v0411", "v0890", "v1139", "v0390", "v1010"] },
    { kind: "vocab", vocabId: "v1339", format: "en_to_ko_choice", // 또 오세요 · Please come again
      distractorIds: ["v0528", "v0478", "v0778", "v0328", "v0928"] },
    { kind: "vocab", vocabId: "v1371", format: "vocab_choice", // 십 · ten, Sino-Korean
      distractorIds: ["v0121", "v0822", "v0221", "v0922", "v0322"] },
    { kind: "vocab", vocabId: "v1376", format: "en_to_ko_choice", // 인도네시아 · Indonesia
      distractorIds: ["v0426", "v0776", "v0826", "v1125", "v1276"] },
    { kind: "vocab", vocabId: "v1410", format: "en_to_ko_choice", // 잠깐만요 · Hold on a second
      distractorIds: ["v0378", "v0428", "v0528", "v1389", "v1028"] },
    { kind: "vocab", vocabId: "v1424", format: "vocab_choice", // 그뿐만 아니라 · not only that
      distractorIds: ["v0025", "v0375", "v0225", "v0675", "v0175"] },
    { kind: "vocab", vocabId: "v1442", format: "en_to_ko_choice", // 도움이 되다 · to be of help
      distractorIds: ["v0593", "v0479", "v1478", "v1190", "v0458"] },
    { kind: "vocab", vocabId: "v1472", format: "vocab_choice", // 줄기 · counter for stems and streams
      distractorIds: ["v0172", "v1272", "v0473", "v0973", "v0273"] },
    { kind: "vocab", vocabId: "v1478", format: "en_to_ko_choice", // 신경을 쓰다 · to pay attention to, to fuss over
      distractorIds: ["v0258", "v0043", "v0308", "v0911", "v1457"] },

    // --- day 4 (25) ---
    { kind: "vocab", vocabId: "v0990", format: "vocab_choice", // 으로서 · as, in the role of
      distractorIds: ["v1109", "v0960", "v1139", "v0890", "v0174"] },
    { kind: "vocab", vocabId: "v1022", format: "vocab_choice", // 삼 · three
      distractorIds: ["v0071", "v0221", "v1071", "v0171", "v0822"] },
    { kind: "vocab", vocabId: "v1027", format: "en_to_ko_choice", // 교통 체증 · traffic congestion
      distractorIds: ["v0178", "v0577", "v1076", "v0977", "v0228"] },
    { kind: "vocab", vocabId: "v1060", format: "en_to_ko_choice", // 아 두다 · to do in advance
      distractorIds: ["v0429", "v0658", "v0080", "v0408", "v0343"] },
    { kind: "vocab", vocabId: "v1074", format: "vocab_choice", // 아이고 · oh dear, oh no
      distractorIds: ["v0226", "v0875", "v1325", "v1124", "v0975"] },
    { kind: "vocab", vocabId: "v1090", format: "en_to_ko_choice", // 아 가다 · to go on doing
      distractorIds: ["v0991", "v1110", "v0193", "v0493", "v0007"] },
    { kind: "vocab", vocabId: "v1122", format: "vocab_choice", // 곡 · counter for songs
      distractorIds: ["v0573", "v1072", "v1472", "v0673", "v0072"] },
    { kind: "vocab", vocabId: "v1127", format: "en_to_ko_choice", // 신경 쓰지 마세요 · Never mind, do not bother
      distractorIds: ["v0678", "v0328", "v0278", "v1439", "v1177"] },
    { kind: "vocab", vocabId: "v1170", format: "vocab_choice", // 모든 · every one
      distractorIds: ["v1420", "v0070", "v0020", "v1370", "v1070"] },
    { kind: "vocab", vocabId: "v1175", format: "en_to_ko_choice", // 독일 · Germany
      distractorIds: ["v0326", "v0376", "v0776", "v0676", "v0826"] },
    { kind: "vocab", vocabId: "v1209", format: "vocab_choice", // 이나마 · even if only
      distractorIds: ["v0290", "v0361", "v0440", "v0124", "v0690"] },
    { kind: "vocab", vocabId: "v1223", format: "vocab_choice", // 잔 · counter for cups and glasses
      distractorIds: ["v0574", "v0974", "v1123", "v0924", "v0674"] },
    { kind: "vocab", vocabId: "v1239", format: "vocab_choice", // 이야 · as for, at least
      distractorIds: ["v0840", "v1059", "v1010", "v0640", "v0810"] },
    { kind: "vocab", vocabId: "v1271", format: "vocab_choice", // 팔 · arm / eight
      distractorIds: ["v0522", "v0772", "v1471", "v0221", "v1171"] },
    { kind: "vocab", vocabId: "v1276", format: "en_to_ko_choice", // 캐나다 · Canada
      distractorIds: ["v0526", "v0726", "v0876", "v1125", "v0976"] },
    { kind: "vocab", vocabId: "v1310", format: "en_to_ko_choice", // 어서 오세요 · Welcome, come in
      distractorIds: ["v1028", "v0928", "v0328", "v0678", "v0278"] },
    { kind: "vocab", vocabId: "v1324", format: "vocab_choice", // 그리하여 · and thus
      distractorIds: ["v0175", "v0575", "v0225", "v0625", "v0325"] },
    { kind: "vocab", vocabId: "v1342", format: "en_to_ko_choice", // 스트레스를 받다 · to get stressed
      distractorIds: ["v0030", "v1407", "v0157", "v0329", "v0579"] },
    { kind: "vocab", vocabId: "v1372", format: "vocab_choice", // 그릇 · counter for bowls of food
      distractorIds: ["v1472", "v0623", "v0172", "v0973", "v1422"] },
    { kind: "vocab", vocabId: "v1378", format: "en_to_ko_choice", // 시험을 보다 · to take an exam
      distractorIds: ["v0043", "v0891", "v0030", "v0593", "v1190"] },
    { kind: "vocab", vocabId: "v1420", format: "vocab_choice", // 옛 · old, former
      distractorIds: ["v0170", "v1370", "v0220", "v1170", "v1220"] },
    { kind: "vocab", vocabId: "v1425", format: "vocab_choice", // 그래 · okay, right
      distractorIds: ["v1025", "v0975", "v0775", "v0026", "v0226"] },
    { kind: "vocab", vocabId: "v1457", format: "en_to_ko_choice", // 마음에 들다 · to be to one's liking
      distractorIds: ["v1210", "v0458", "v1378", "v1292", "v0479"] },
    { kind: "vocab", vocabId: "v1473", format: "vocab_choice", // 깨나 · quite a bit of
      distractorIds: ["v0174", "v0840", "v0690", "v0910", "v0640"] },
    { kind: "vocab", vocabId: "v1489", format: "en_to_ko_choice", // 얼마예요 · How much is it
      distractorIds: ["v0628", "v0179", "v1339", "v0828", "v0528"] },

    // --- day 5 (25) ---
    { kind: "vocab", vocabId: "v0991", format: "en_to_ko_choice", // 고 말다 · to end up doing
      distractorIds: ["v0529", "v0393", "v0193", "v0408", "v0057"] },
    { kind: "vocab", vocabId: "v1023", format: "vocab_choice", // 부 · counter for copies of a document
      distractorIds: ["v0373", "v0973", "v0273", "v1472", "v0623"] },
    { kind: "vocab", vocabId: "v1028", format: "en_to_ko_choice", // 조심하세요 · Please be careful
      distractorIds: ["v0528", "v0029", "v0278", "v0778", "v0728"] },
    { kind: "vocab", vocabId: "v1070", format: "vocab_choice", // 몇 · how many / a few
      distractorIds: ["v1470", "v1220", "v1170", "v1270", "v1370"] },
    { kind: "vocab", vocabId: "v1075", format: "en_to_ko_choice", // 영국 · United Kingdom
      distractorIds: ["v0976", "v0826", "v0926", "v0776", "v1476"] },
    { kind: "vocab", vocabId: "v1109", format: "vocab_choice", // 이며 · and, listing nouns
      distractorIds: ["v0960", "v0790", "v1089", "v1373", "v0990"] },
    { kind: "vocab", vocabId: "v1123", format: "vocab_choice", // 권 · counter for books
      distractorIds: ["v0424", "v0474", "v0123", "v0724", "v0324"] },
    { kind: "vocab", vocabId: "v1139", format: "vocab_choice", // 치고 · for a, considering
      distractorIds: ["v0790", "v0690", "v1109", "v0490", "v0990"] },
    { kind: "vocab", vocabId: "v1171", format: "vocab_choice", // 육 · the number six
      distractorIds: ["v0972", "v0522", "v1271", "v0322", "v1371"] },
    { kind: "vocab", vocabId: "v1176", format: "en_to_ko_choice", // 취업 준비 · job hunting preparation
      distractorIds: ["v0178", "v1226", "v0427", "v0977", "v0078"] },
    { kind: "vocab", vocabId: "v1210", format: "en_to_ko_choice", // 관심을 갖다 · to take an interest
      distractorIds: ["v0258", "v0629", "v0030", "v1492", "v0558"] },
    { kind: "vocab", vocabId: "v1224", format: "vocab_choice", // 저기요 · excuse me, getting attention
      distractorIds: ["v0875", "v1475", "v1275", "v1375", "v1174"] },
    { kind: "vocab", vocabId: "v1240", format: "en_to_ko_choice", // 시간을 보내다 · to spend time
      distractorIds: ["v0207", "v1407", "v0458", "v0243", "v0579"] },
    { kind: "vocab", vocabId: "v1272", format: "vocab_choice", // 알 · counter for small round things
      distractorIds: ["v0923", "v0273", "v0473", "v0973", "v0423"] },
    { kind: "vocab", vocabId: "v1278", format: "en_to_ko_choice", // 꿈을 꾸다 · to have a dream
      distractorIds: ["v0708", "v0080", "v0693", "v0443", "v0861"] },
    { kind: "vocab", vocabId: "v1320", format: "vocab_choice", // 다른 · other, different
      distractorIds: ["v1470", "v0020", "v0220", "v1120", "v1370"] },
    { kind: "vocab", vocabId: "v1325", format: "vocab_choice", // 여보 · honey, to a spouse
      distractorIds: ["v0226", "v1275", "v1475", "v1425", "v1074"] },
    { kind: "vocab", vocabId: "v1357", format: "en_to_ko_choice", // 감기에 걸리다 · to catch a cold
      distractorIds: ["v0579", "v0608", "v0230", "v0279", "v1392"] },
    { kind: "vocab", vocabId: "v1373", format: "vocab_choice", // 마는 · but, as a particle
      distractorIds: ["v0611", "v0960", "v0490", "v1139", "v1109"] },
    { kind: "vocab", vocabId: "v1389", format: "en_to_ko_choice", // 잠시만요 · Just a moment
      distractorIds: ["v0029", "v1028", "v1489", "v0378", "v0328"] },
    { kind: "vocab", vocabId: "v1421", format: "vocab_choice", // 이십 · twenty
      distractorIds: ["v1471", "v0472", "v0672", "v0772", "v0071"] },
    { kind: "vocab", vocabId: "v1426", format: "en_to_ko_choice", // 베트남 · Vietnam
      distractorIds: ["v0626", "v0576", "v0826", "v0776", "v0926"] },
    { kind: "vocab", vocabId: "v1460", format: "en_to_ko_choice", // 여기 있어요 · Here it is
      distractorIds: ["v0578", "v0478", "v0428", "v0278", "v1339"] },
    { kind: "vocab", vocabId: "v1474", format: "vocab_choice", // 다만 · but, only
      distractorIds: ["v0425", "v0125", "v0175", "v0475", "v0375"] },
    { kind: "vocab", vocabId: "v1492", format: "en_to_ko_choice", // 눈치를 보다 · to read the room, watch someone's mood
      distractorIds: ["v0911", "v0308", "v0030", "v0007", "v1442"] },

    // --- review: the 20 words the class gets wrong most often (weeks 1-2) ---
    { kind: "vocab", vocabId: "v0007", format: "en_to_ko_choice", // 안녕하세요 · Hello
      distractorIds: ["v0180", "v0293", "v1011", "v0543", "v0743"] },
    { kind: "vocab", vocabId: "v0021", format: "vocab_choice", // 하나 · one
      distractorIds: ["v0572", "v0322", "v0522", "v1071", "v0472"] },
    { kind: "vocab", vocabId: "v0022", format: "vocab_choice", // 개 · counter for objects
      distractorIds: ["v1122", "v1322", "v0523", "v0323", "v1422"] },
    { kind: "vocab", vocabId: "v0023", format: "vocab_choice", // 것 · thing, one
      distractorIds: ["v1024", "v0674", "v0173", "v1173", "v0274"] },
    { kind: "vocab", vocabId: "v0024", format: "vocab_choice", // 은 · topic marker
      distractorIds: ["v0940", "v0740", "v0511", "v0540", "v1273"] },
    { kind: "vocab", vocabId: "v0025", format: "vocab_choice", // 그리고 · and, joining sentences
      distractorIds: ["v1424", "v0625", "v0325", "v0525", "v1474"] },
    { kind: "vocab", vocabId: "v0026", format: "vocab_choice", // 네 · yes
      distractorIds: ["v0925", "v1224", "v1174", "v1074", "v0226"] },
    { kind: "vocab", vocabId: "v0029", format: "en_to_ko_choice", // 잘 모르겠어요 · I do not really know
      distractorIds: ["v0678", "v1310", "v1077", "v0928", "v0878"] },
    { kind: "vocab", vocabId: "v0030", format: "en_to_ko_choice", // 안녕히 가세요 · Goodbye, to someone leaving
      distractorIds: ["v0608", "v1428", "v0579", "v0143", "v0841"] },
    { kind: "vocab", vocabId: "v0043", format: "en_to_ko_choice", // 안녕히 계세요 · Goodbye, to someone staying
      distractorIds: ["v0458", "v1240", "v0258", "v0841", "v0279"] },
    { kind: "vocab", vocabId: "v0069", format: "vocab_choice", // 나 · I, casual
      distractorIds: ["v0921", "v0119", "v0621", "v0871", "v0019"] },
    { kind: "vocab", vocabId: "v0070", format: "vocab_choice", // 그 · that / he
      distractorIds: ["v1220", "v1120", "v1170", "v1270", "v1070"] },
    { kind: "vocab", vocabId: "v0071", format: "vocab_choice", // 둘 · two, native
      distractorIds: ["v0822", "v0722", "v0372", "v0922", "v0472"] },
    { kind: "vocab", vocabId: "v0072", format: "vocab_choice", // 장 · one piece of sth flat
      distractorIds: ["v0222", "v0973", "v1072", "v0323", "v0573"] },
    { kind: "vocab", vocabId: "v0073", format: "vocab_choice", // 수 · ability / way
      distractorIds: ["v0774", "v1123", "v0824", "v0474", "v0424"] },
    { kind: "vocab", vocabId: "v0074", format: "vocab_choice", // 이 · subject marker
      distractorIds: ["v0024", "v0840", "v1273", "v1209", "v1473"] },
    { kind: "vocab", vocabId: "v0493", format: "en_to_ko_choice", // 에 관해 · regarding
      distractorIds: ["v0408", "v0393", "v1110", "v0080", "v0379"] },
    { kind: "vocab", vocabId: "v0508", format: "en_to_ko_choice", // 에 반해 · in contrast to
      distractorIds: ["v0393", "v0358", "v0343", "v1110", "v0408"] },
    { kind: "vocab", vocabId: "v0511", format: "vocab_choice", // 도 · also, too
      distractorIds: ["v0290", "v0361", "v0640", "v0910", "v0024"] },
    { kind: "vocab", vocabId: "v0525", format: "vocab_choice", // 그래도 · still, even so
      distractorIds: ["v1424", "v0675", "v0375", "v0225", "v0125"] },

    // --- grammar: this week's four patterns against everything taught ---
    { kind: "grammar", grammarId: "g1-g17", format: "grammar_choice", // -고 · And / then
      distractorIds: ["g1-g14", "g1-g11", "g1-g19", "g1-g18", "g1-g13"] },
    { kind: "grammar", grammarId: "g1-g18", format: "grammar_choice", // -아서/어서 · Because / then
      distractorIds: ["g1-g16", "g1-g19", "g1-g10", "g1-g2", "g1-g14"] },
    { kind: "grammar", grammarId: "g1-g19", format: "grammar_choice", // -지만 · But / although
      distractorIds: ["g1-g1", "g1-g2", "g1-g17", "g1-g11", "g1-g18"] },
    { kind: "grammar", grammarId: "g1-g2", format: "grammar_choice", // 이/가 · Subject particle
      distractorIds: ["g1-g13", "g1-g19", "g1-g14", "g1-g16", "g1-g10"] },
    // --- reading ---
    //
    // The first turns on one word, so it feeds that word's mastery and is
    // tagged with it. The rest are comprehension: they score, and the importer
    // says plainly that they feed nothing else. Options are authored here
    // because no corpus entry stands behind them — which is why they are the
    // one place the length rules are worth reading twice.
    {
      kind: "reading",
      prompt: "본문에서 '취업 준비'는 무슨 뜻이에요?",
      choices: [
        "job hunting preparation",
        "self-development",
        "working conditions",
        "table manners",
        "traffic congestion",
        "parking space",
      ],
      correctAnswer: "job hunting preparation",
      targetsVocabId: "v1176",
    },
    {
      kind: "reading",
      prompt: "What does the writer do on days they take an exam?",
      choices: [
        "They get stressed, but friends encourage them",
        "They stay at home and rest all day",
        "They take photographs with an old friend",
        "They start a small job at a company",
        "They make a plan for the whole term",
        "They put effort into self-development",
      ],
      correctAnswer: "They get stressed, but friends encourage them",
    },
    {
      kind: "reading",
      prompt: "What does the writer say has been a big help?",
      choices: [
        "The habit of keeping promises",
        "The habit of getting up late",
        "Taking an exam every single week",
        "Working at several large companies",
        "Spending the weekend alone",
        "Making a decision very quickly",
      ],
      correctAnswer: "The habit of keeping promises",
    },
    {
      kind: "reading",
      prompt: "What did the writer do last weekend?",
      choices: [
        "Took photos with a friend and spent time",
        "Made a plan for the new term ahead",
        "Started preparing to hunt for a job",
        "Made a decision about which company",
        "Got up early and studied all morning",
        "Went to several companies to ask",
      ],
      correctAnswer: "Took photos with a friend and spent time",
    },
  ],
};

export default test;

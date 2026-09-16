import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "./index";
import {
  classSettings,
  corpusGrammar,
  corpusVocab,
  teamMembers,
  teams,
  users,
  weekPlanGrammar,
  weekPlanVocab,
  weekPlans,
  type Role,
} from "./schema";
import { buildSemesterPlan } from "../lib/plan";
import { syntheticEmail } from "../lib/password";

/**
 * Seeds the corpus, the cohort (15 students in 3 teams), and the full
 * semester plan. Re-runnable: wipes and rebuilds. Local dev only.
 */

const TERM_START = "2026-09-14";
const TERM_END = "2026-12-14";

type VocabJson = {
  id: string; korean: string; english: string; acceptedAnswers: string[];
  partOfSpeech: string | null; level: 1 | 2; topic: string | null;
  day: number | null; lessons: string[];
};
type GrammarJson = {
  id: string; form: string; name: string; meaning: string;
  shape: string | null; level: 1 | 3; examples: { ko: string; en: string }[];
};

function load<T>(file: string): T {
  return JSON.parse(
    readFileSync(path.resolve("src/corpus/data", file), "utf8"),
  ) as T;
}

const STUDENT_NAMES = [
  "Yuna", "Minho", "Sora", "Jinwoo", "Hana",
  "Daeun", "Seojun", "Chaeyoung", "Taemin", "Bora",
  "Junseo", "Nari", "Woojin", "Sena", "Hyun",
];
const TA_NAMES = ["Eunji", "Sangwoo", "Mira"];

async function main() {
  console.log("seeding...");

  await db.execute(sql`
    truncate table
      ${weeklyReportsRef}, ${practiceResponsesRef}, ${practiceRunsRef},
      ${responsesRef}, ${attemptsRef}, ${questionsRef}, ${testsRef},
      ${weekPlanVocab}, ${weekPlanGrammar}, ${weekPlans}, ${corpusVocab},
      ${corpusGrammar}, ${teamMembers}, ${teams}, ${users}, ${classSettings}
    restart identity cascade
  `);

  // --- corpus ---------------------------------------------------------
  const vocabRows = load<VocabJson[]>("vocab.json");
  const grammarRows = load<GrammarJson[]>("grammar.json");

  await db.insert(corpusVocab).values(
    vocabRows.map((v) => ({
      id: v.id,
      korean: v.korean,
      english: v.english,
      acceptedAnswers: v.acceptedAnswers,
      partOfSpeech: v.partOfSpeech,
      level: v.level,
      topic: v.topic,
      sourceDay: v.day,
      lessons: v.lessons,
    })),
  );

  await db.insert(corpusGrammar).values(
    grammarRows.map((g) => ({
      id: g.id,
      form: g.form,
      name: g.name,
      meaning: g.meaning,
      shape: g.shape,
      level: g.level,
      examples: g.examples,
    })),
  );

  // --- settings -------------------------------------------------------
  const [settings] = await db
    .insert(classSettings)
    .values({
      id: 1,
      termStart: TERM_START,
      termEnd: TERM_END,
      vocabGoal: 1500,
      grammarGoal: 52,
      vocabPerWeek: 125,
      grammarPerWeek: 4,
      maxVocabLevel: 2,
      maxGrammarLevel: 3,
      studyDaysPerWeek: 5,
    })
    .returning();

  // --- people ---------------------------------------------------------
  //
  // Roster rows only. Sign-in accounts need the Supabase admin API, so they
  // are created by `npm run db:seed:auth`, which is a separate step precisely
  // because it needs the service key and this script does not.
  const row = (name: string, roles: Role[], i = 0) => ({
    username: name.toLowerCase().replace(/[^a-z0-9]/g, ""),
    email: syntheticEmail(name.toLowerCase().replace(/[^a-z0-9]/g, "")),
    displayName: name,
    roles,
    ...(roles.includes("student")
      ? { birthday: `200${5 + (i % 4)}-0${(i % 9) + 1}-1${i % 9}` }
      : {}),
  });

  await db
    .insert(users)
    .values({ ...row("Seonsaengnim", ["teacher"]), displayName: "Kim Seonsaengnim" });

  const tas = await db
    .insert(users)
    .values(TA_NAMES.map((n) => row(n, ["ta"])))
    .returning();

  const students = await db
    .insert(users)
    .values(STUDENT_NAMES.map((n, i) => row(n, ["student"], i)))
    .returning();

  // Three teams of five, each with one TA.
  const teamRows = await db
    .insert(teams)
    .values(tas.map((ta, i) => ({ name: `Team ${i + 1}`, taId: ta.id })))
    .returning();

  await db.insert(teamMembers).values(
    students.map((s, i) => ({
      teamId: teamRows[i % teamRows.length].id,
      studentId: s.id,
    })),
  );

  // --- semester plan --------------------------------------------------
  const plan = buildSemesterPlan({
    termStart: new Date(`${TERM_START}T00:00:00Z`),
    termEnd: new Date(`${TERM_END}T00:00:00Z`),
    vocabPerWeek: settings.vocabPerWeek,
    grammarPerWeek: settings.grammarPerWeek,
    studyDaysPerWeek: settings.studyDaysPerWeek,
    vocab: vocabRows
      .filter((v) => v.level <= settings.maxVocabLevel)
      .map((v) => ({
        id: v.id,
        level: v.level,
        sourceDay: v.day,
        partOfSpeech: v.partOfSpeech,
      })),
    grammar: grammarRows
      .filter((g) => g.level <= settings.maxGrammarLevel)
      .map((g) => ({ id: g.id, level: g.level })),
  });

  for (const week of plan) {
    const [row] = await db
      .insert(weekPlans)
      .values({
        weekKey: week.weekKey,
        weekNumber: week.weekNumber,
        startsOn: week.startsOn.toISOString().slice(0, 10),
        endsOn: week.endsOn.toISOString().slice(0, 10),
      })
      .returning();

    if (week.vocab.length) {
      await db.insert(weekPlanVocab).values(
        week.vocab.map((v) => ({
          weekPlanId: row.id,
          vocabId: v.id,
          studyDay: v.studyDay,
        })),
      );
    }
    if (week.grammar.length) {
      await db.insert(weekPlanGrammar).values(
        week.grammar.map((g) => ({ weekPlanId: row.id, grammarId: g })),
      );
    }
  }

  const plannedVocab = plan.reduce((n, w) => n + w.vocab.length, 0);
  const plannedGrammar = plan.reduce((n, w) => n + w.grammar.length, 0);

  console.log(`corpus:  ${vocabRows.length} vocab, ${grammarRows.length} grammar`);
  console.log(`people:  1 teacher, ${tas.length} TAs, ${students.length} students in ${teamRows.length} teams`);
  console.log(`plan:    ${plan.length} weeks, ${plannedVocab} vocab, ${plannedGrammar} grammar`);
  console.log(`         ${settings.vocabPerWeek}/week vocab, ${settings.grammarPerWeek}/week grammar`);
  process.exit(0);
}

// Tables truncated but not otherwise written here.
import {
  attempts as attemptsRef,
  practiceResponses as practiceResponsesRef,
  practiceRuns as practiceRunsRef,
  questions as questionsRef,
  responses as responsesRef,
  tests as testsRef,
  weeklyReports as weeklyReportsRef,
} from "./schema";

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

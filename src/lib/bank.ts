import "server-only";

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  corpusGrammar,
  corpusVocab,
  weekPlanGrammar,
  weekPlanVocab,
  weekPlans,
} from "@/db/schema";
import type { BankGrammar, BankWord } from "./bank-shared";

/**
 * A student's bank is every weekly plan up to the current week. Assignment is
 * uniform across the cohort, so this is the same set for everyone; what differs
 * per student is their test results, not their words.
 *
 * `server-only` above is load-bearing: a client component importing this would
 * otherwise pull `pg` into the browser bundle.
 */

export type { BankGrammar, BankWord };

export async function plannedWeekCount(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(weekPlans);
  return row?.n ?? 0;
}

export async function bankWords(upToWeek: number): Promise<BankWord[]> {
  return db
    .select({
      id: corpusVocab.id,
      korean: corpusVocab.korean,
      english: corpusVocab.english,
      acceptedAnswers: corpusVocab.acceptedAnswers,
      partOfSpeech: corpusVocab.partOfSpeech,
      topic: corpusVocab.topic,
      weekNumber: weekPlans.weekNumber,
      studyDay: weekPlanVocab.studyDay,
    })
    .from(weekPlanVocab)
    .innerJoin(weekPlans, eq(weekPlans.id, weekPlanVocab.weekPlanId))
    .innerJoin(corpusVocab, eq(corpusVocab.id, weekPlanVocab.vocabId))
    .where(and(lte(weekPlans.weekNumber, upToWeek), eq(corpusVocab.retired, false)))
    .orderBy(
      asc(weekPlans.weekNumber),
      asc(weekPlanVocab.studyDay),
      asc(corpusVocab.korean),
    );
}

export async function bankGrammar(upToWeek: number): Promise<BankGrammar[]> {
  return db
    .select({
      id: corpusGrammar.id,
      form: corpusGrammar.form,
      name: corpusGrammar.name,
      meaning: corpusGrammar.meaning,
      shape: corpusGrammar.shape,
      level: corpusGrammar.level,
      examples: corpusGrammar.examples,
      weekNumber: weekPlans.weekNumber,
    })
    .from(weekPlanGrammar)
    .innerJoin(weekPlans, eq(weekPlans.id, weekPlanGrammar.weekPlanId))
    .innerJoin(corpusGrammar, eq(corpusGrammar.id, weekPlanGrammar.grammarId))
    .where(and(lte(weekPlans.weekNumber, upToWeek), eq(corpusGrammar.retired, false)))
    .orderBy(asc(weekPlans.weekNumber), asc(corpusGrammar.level));
}

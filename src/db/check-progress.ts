/**
 * Prints the seeded semester plan and what a student's bank looks like today.
 * Run with `npm run db:check`.
 */
import { asc, sql } from "drizzle-orm";
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
} from "./schema";
import { bankGrammar, bankWords } from "../lib/bank";
import { groupByPos, weekNumberFor } from "../lib/bank-shared";

async function main() {
  const [s] = await db.select().from(classSettings).limit(1);
  const plan = await db
    .select({
      weekNumber: weekPlans.weekNumber,
      weekKey: weekPlans.weekKey,
      startsOn: weekPlans.startsOn,
      vocab: sql<number>`(select count(*) from ${weekPlanVocab} where ${weekPlanVocab.weekPlanId} = ${weekPlans.id})::int`,
      grammar: sql<number>`(select count(*) from ${weekPlanGrammar} where ${weekPlanGrammar.weekPlanId} = ${weekPlans.id})::int`,
    })
    .from(weekPlans)
    .orderBy(asc(weekPlans.weekNumber));

  const [{ v }] = await db
    .select({ v: sql<number>`count(*)::int` })
    .from(corpusVocab);
  const [{ g }] = await db
    .select({ g: sql<number>`count(*)::int` })
    .from(corpusGrammar);

  console.log(`corpus: ${v} vocab, ${g} grammar`);
  console.log(`term:   ${s.termStart} → ${s.termEnd}`);
  console.log(
    `goals:  ${s.vocabGoal} vocab, ${s.grammarGoal} grammar | ${s.vocabPerWeek}/wk + ${s.grammarPerWeek}/wk over ${s.studyDaysPerWeek} days\n`,
  );

  console.log("plan:");
  for (const w of plan) {
    console.log(
      `  wk ${String(w.weekNumber).padStart(2)}  ${w.weekKey}  from ${w.startsOn}  ${String(w.vocab).padStart(3)} vocab  ${w.grammar} grammar`,
    );
  }
  const totV = plan.reduce((n, w) => n + w.vocab, 0);
  const totG = plan.reduce((n, w) => n + w.grammar, 0);
  console.log(`  total: ${totV} vocab, ${totG} grammar over ${plan.length} weeks`);

  // --- teams ---
  const roster = await db
    .select({
      team: teams.name,
      ta: sql<string>`(select display_name from ${users} where ${users.id} = ${teams.taId})`,
      members: sql<number>`(select count(*) from ${teamMembers} where ${teamMembers.teamId} = ${teams.id})::int`,
    })
    .from(teams)
    .orderBy(asc(teams.name));
  console.log("\nteams:");
  for (const t of roster) {
    console.log(`  ${t.team}  TA ${t.ta}  ${t.members} students`);
  }

  // --- bank as of today ---
  const week = weekNumberFor(new Date(), s.termStart, plan.length);
  const words = await bankWords(week);
  const grammar = await bankGrammar(week);
  console.log(`\nbank at week ${week}: ${words.length} words, ${grammar.length} grammar`);

  const pos = groupByPos(words);
  console.log("  by part of speech:");
  for (const p of pos) {
    console.log(`    ${p.label.padEnd(20)} ${p.korean.padEnd(8)} ${p.words.length}`);
  }

  const days = new Map<number, number>();
  for (const w of words) days.set(w.studyDay, (days.get(w.studyDay) ?? 0) + 1);
  console.log(
    "  by study day: " +
      [...days.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => `day ${d}: ${n}`).join(", "),
  );

  console.log("\n  grammar this far:");
  for (const g of grammar) {
    console.log(`    ${g.form.padEnd(16)} ${g.name}`);
  }

  const [student] = await db
    .select()
    .from(users)
    .where(sql`'student' = any(${users.roles})`)
    .orderBy(users.createdAt)
    .limit(1);
  console.log(`\n(viewing as ${student.displayName})`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

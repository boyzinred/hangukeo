/**
 * Moves the semester to new dates without rebuilding it.
 *
 * `db:seed` also sets the term, but it opens with TRUNCATE — it would take the
 * corpus, the assignments, and everyone's results with it. Only the dates
 * change here: which words belong to which week is untouched, so a class part
 * way through a term can be shifted without losing anything.
 *
 *   npm run db:set-term -- --start 2026-09-21
 *   ENV_FILE=.env.cloud.local npm run db:set-term:cloud -- --start 2026-09-21
 *
 * Weeks are seven days long and run from the start date, so the start date is
 * the only input; every week and the term end follow from it.
 */
import { asc, eq } from "drizzle-orm";
import { db } from "./index";
import { classSettings, weekPlans } from "./schema";
import { isoWeekKey } from "../lib/plan";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
};

async function main() {
  const startArg = arg("start");
  if (!startArg || !/^\d{4}-\d{2}-\d{2}$/.test(startArg)) {
    console.error("Usage: npm run db:set-term -- --start YYYY-MM-DD");
    process.exit(1);
  }
  const termStart = new Date(`${startArg}T00:00:00Z`);
  if (Number.isNaN(termStart.getTime())) {
    console.error(`"${startArg}" is not a date.`);
    process.exit(1);
  }

  const weeks = await db.select().from(weekPlans).orderBy(asc(weekPlans.weekNumber));
  if (weeks.length === 0) {
    console.error("No week plans. Run the seed first.");
    process.exit(1);
  }

  const termEnd = addDays(termStart, weeks.length * 7 - 1);

  // week_key is unique, and shifting the term by a whole number of weeks makes
  // every new key one that another row still holds — week 1 moves onto week
  // 2's key while week 2 is still sitting on it. Parking them all on a
  // throwaway key first means the order of the real writes never matters.
  await db.transaction(async (tx) => {
    for (const w of weeks) {
      await tx
        .update(weekPlans)
        .set({ weekKey: `moving-${w.id}` })
        .where(eq(weekPlans.id, w.id));
    }

    for (const w of weeks) {
      const startsOn = addDays(termStart, (w.weekNumber - 1) * 7);
      const endsOn = addDays(startsOn, 6);
      await tx
        .update(weekPlans)
        .set({
          startsOn: iso(startsOn),
          endsOn: iso(endsOn),
          weekKey: isoWeekKey(startsOn),
        })
        .where(eq(weekPlans.id, w.id));
    }

    await tx
      .update(classSettings)
      .set({ termStart: iso(termStart), termEnd: iso(termEnd) });
  });

  const after = await db.select().from(weekPlans).orderBy(asc(weekPlans.weekNumber));
  console.log(`term: ${iso(termStart)} → ${iso(termEnd)} (${weeks.length} weeks)\n`);
  for (const w of after.slice(0, 2)) {
    console.log(`  week ${String(w.weekNumber).padStart(2)}  ${w.startsOn} → ${w.endsOn}  ${w.weekKey}`);
  }
  console.log("  …");
  const last = after[after.length - 1];
  console.log(`  week ${last.weekNumber}  ${last.startsOn} → ${last.endsOn}  ${last.weekKey}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

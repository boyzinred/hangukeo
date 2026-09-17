/**
 * Loads the corpus and the semester plan into an *empty* database.
 *
 * `db:seed` opens with TRUNCATE ... CASCADE, which is right for a local stack
 * you rebuild all day and catastrophic against a running class — it would take
 * every student's answers with it. There is deliberately no cloud seed that
 * can do that, so this one refuses unless the target is genuinely empty and
 * then delegates to the same script.
 *
 *   ENV_FILE=.env.cloud.local npm run db:seed:cloud
 *
 * Accounts are not created here. The first teacher and admin are made with
 * `user:create`, which issues a real password once and prints it.
 */
import { sql } from "drizzle-orm";
import { db } from "./index";

const GUARDED = [
  "users",
  "responses",
  "attempts",
  "practice_runs",
  "tests",
  "corpus_vocab",
  "week_plans",
];

async function main() {
  const target = new URL(process.env.DATABASE_URL ?? "postgres://unset").host;
  console.log(`target: ${target}\n`);

  const occupied: string[] = [];
  const missing: string[] = [];

  for (const table of GUARDED) {
    // A table that is not there at all means the migrations have not run,
    // which is a different problem and worth naming as one rather than
    // surfacing as a failed count query.
    const { rows } = await db
      .execute<{ n: string }>(
        sql`select count(*)::text as n from ${sql.identifier(table)}`,
      )
      .catch(() => null) ?? { rows: [] };

    if (rows.length === 0) {
      missing.push(table);
      console.log(`  ${table.padEnd(16)} ${"—".padStart(6)}  not present`);
      continue;
    }
    const n = Number(rows[0].n);
    console.log(`  ${table.padEnd(16)} ${String(n).padStart(6)} rows`);
    if (n > 0) occupied.push(`${table} (${n})`);
  }

  if (missing.length > 0) {
    console.error(
      `\nThis database is not on the current schema — ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} missing.` +
        "\nRun `npm run db:migrate:cloud` first.",
    );
    process.exit(1);
  }

  if (occupied.length > 0) {
    console.error(
      `\nRefusing to seed: ${occupied.join(", ")} already hold data.` +
        "\nThe seed truncates every table, so running it here would delete them." +
        "\nIf you really mean to start over, empty the database yourself first.",
    );
    process.exit(1);
  }

  console.log("\nEmpty. Running the seed.\n");
  await import("./seed");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

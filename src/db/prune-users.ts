/**
 * Removes roster rows that have never had a sign-in account.
 *
 * `db:seed` writes a fixture roster — Yuna, Bora, Minho and the rest — because
 * the local stack needs people to develop against. On a real deployment they
 * are nineteen strangers who show up in the roster, in class progress and in
 * the admin list, and whose usernames are held against the real students who
 * might want them.
 *
 * Deleting them through the teacher screen means typing each username to
 * confirm, nineteen times. This does the same thing in one pass, and only to
 * people who never had a way in and never produced anything:
 *
 *   ENV_FILE=.env.cloud.local npm run users:prune:cloud            # list only
 *   ENV_FILE=.env.cloud.local npm run users:prune:cloud -- --apply
 *
 * Anyone who can sign in is left alone, whatever else is true of them.
 */
import { asc, isNull, sql } from "drizzle-orm";
import { db } from "./index";
import { attempts, practiceRuns, responses, users } from "./schema";
import { deleteAccount } from "../lib/accounts";

const apply = process.argv.includes("--apply");

async function main() {
  const target = new URL(process.env.DATABASE_URL ?? "postgres://unset").host;
  console.log(`target: ${target}\n`);

  const candidates = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      roles: users.roles,
      attempts: sql<number>`(select count(*) from ${attempts} a where a.student_id = ${users.id})::int`,
      responses: sql<number>`(select count(*) from ${responses} r where r.student_id = ${users.id})::int`,
      practice: sql<number>`(select count(*) from ${practiceRuns} p where p.student_id = ${users.id})::int`,
    })
    .from(users)
    .where(isNull(users.authId))
    .orderBy(asc(users.username));

  if (candidates.length === 0) {
    console.log("Nothing to prune — everyone on the roster has a sign-in account.");
    process.exit(0);
  }

  // A row with results is not a fixture, whatever its auth state. Refusing is
  // the right answer rather than deleting somebody's work on a guess.
  const withWork = candidates.filter(
    (c) => c.attempts + c.responses + c.practice > 0,
  );
  const prunable = candidates.filter(
    (c) => c.attempts + c.responses + c.practice === 0,
  );

  for (const c of prunable) {
    console.log(`  ${c.roles.join("+").padEnd(9)} ${c.username.padEnd(16)} ${c.displayName}`);
  }
  for (const c of withWork) {
    console.log(
      `  KEEPING  ${c.username.padEnd(16)} ${c.displayName} — has ${c.attempts} attempts, ${c.practice} practice runs`,
    );
  }

  console.log(
    `\n${prunable.length} of ${candidates.length} with no sign-in account and nothing recorded.`,
  );

  if (!apply) {
    console.log("Nothing deleted — add --apply to remove them.");
    process.exit(0);
  }

  for (const c of prunable) await deleteAccount(c.id);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  console.log(`\nDeleted ${prunable.length}. ${n} people left on the roster.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

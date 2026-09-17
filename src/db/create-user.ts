/**
 * Creates a sign-in account from the command line.
 *
 * This exists because of a chicken-and-egg: /teacher/people can only be
 * reached by someone who is already a teacher, so the first teacher has to be
 * made from outside the app. It is also the way to add anyone if the teacher
 * ever loses their own password.
 *
 *   npm run user:create -- --name "Kim Seonsaengnim" --role teacher
 *   npm run user:create -- --name "Yuna" --username yuna --role student --team "Team 1"
 *
 * Uses the same createAccount() the teacher UI does, so the password is
 * generated the same way and the account is identical in every respect.
 */
import { asc, eq, sql } from "drizzle-orm";
import { db } from "./index";
import { roleEnum, teams, users, type Role } from "./schema";
import { assertAdminEnv, availableUsername, createAccount } from "../lib/accounts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  // Before touching the database: a missing service key should say so, not
  // arrive later disguised as a failed query.
  assertAdminEnv();

  const displayName = arg("name");
  const roles = (arg("roles") ?? arg("role") ?? "student")
    .split(",")
    .map((r) => r.trim()) as Role[];
  const teamName = arg("team");

  if (!displayName) {
    console.error(
      'Usage: npm run user:create -- --name "Display Name" [--username x] [--role student|ta|teacher|admin] [--team "Team 1"]',
    );
    process.exit(1);
  }
  const bad = roles.filter((r) => !roleEnum.enumValues.includes(r));
  if (bad.length) {
    console.error(`Unknown role(s): ${bad.join(", ")}.`);
    process.exit(1);
  }

  const username = arg("username") ?? (await availableUsername(displayName));

  let teamId: string | null = null;
  if (roles.includes("student") && teamName) {
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(sql`lower(${teams.name})`, teamName.toLowerCase()));
    if (!team) {
      const all = await db.select({ name: teams.name }).from(teams).orderBy(asc(teams.name));
      console.error(
        `No team called "${teamName}". Available: ${all.map((t) => t.name).join(", ") || "none"}`,
      );
      process.exit(1);
    }
    teamId = team.id;
  }

  const account = await createAccount({ username, displayName, roles, teamId });

  console.log(`\ncreated ${roles.join(" + ")}: ${displayName}\n`);
  console.log(`  username   ${account.username}`);
  console.log(`  password   ${account.password}\n`);
  console.log("Shown once — Supabase stores only a hash. Reset from");
  console.log("/teacher/people if it is lost.\n");

  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(sql`'teacher' = any(${users.roles})`);
  if (roles.includes("teacher") && count.n > 1) {
    console.log(`Note: there are now ${count.n} teacher accounts.`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

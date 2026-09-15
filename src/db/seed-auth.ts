import { createClient } from "@supabase/supabase-js";
import { asc, eq } from "drizzle-orm";
import { db } from "./index";
import { users } from "./schema";

/**
 * Gives every seeded roster row a sign-in account with one shared development
 * password, and prints the usernames.
 *
 * Separate from `db:seed` because it needs the Supabase service key, and
 * because it writes to auth.users — which Drizzle does not own. Local only:
 * the password below is deliberately the same for everyone so you can sign in
 * as any role while working, which is exactly what you must never do in
 * production. `createAccount()` in src/lib/accounts.ts is the real path.
 */

const DEV_PASSWORD = "hangukeo-dev-password-42";

async function main() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  if (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("supabase.co")) {
    throw new Error(
      "Refusing to run against a hosted project: this sets one shared password for everyone.",
    );
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const roster = await db.select().from(users).orderBy(asc(users.displayName));
  if (roster.length === 0) throw new Error("run `npm run db:seed` first");

  // Clear any accounts left from a previous run so usernames are free.
  const { data: existing } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  for (const u of existing?.users ?? []) {
    await supabase.auth.admin.deleteUser(u.id).catch(() => {});
  }

  let created = 0;
  for (const person of roster) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: person.email,
      password: DEV_PASSWORD,
      email_confirm: true,
      user_metadata: { username: person.username, display_name: person.displayName },
    });
    if (error || !data.user) {
      console.error(`  failed ${person.username}: ${error?.message}`);
      continue;
    }
    await db
      .update(users)
      .set({ authId: data.user.id })
      .where(eq(users.id, person.id));
    created++;
  }

  console.log(`created ${created} sign-in accounts`);
  console.log(`password for all of them: ${DEV_PASSWORD}\n`);
  for (const p of roster) {
    console.log(`  ${p.roles.join("+").padEnd(14)} ${p.username}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

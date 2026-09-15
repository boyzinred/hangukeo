import { createClient } from "@supabase/supabase-js";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { teamMembers, teams, users } from "@/db/schema";
import {
  generatePassword,
  isValidUsername,
  suggestUsername,
  syntheticEmail,
} from "./password";

/**
 * Account creation and password resets.
 *
 * Uses the Supabase service key, which can do anything — so nothing here
 * checks permissions and nothing here may be called from a route the public
 * can reach. The server actions in app/teacher/people/actions.ts establish
 * that the caller is the teacher before delegating to these.
 */

function adminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type CreatedAccount = {
  userId: string;
  username: string;
  /** Shown to the teacher once, then never retrievable. */
  password: string;
};

export async function usernameTaken(username: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.username})`, username.toLowerCase()))
    .limit(1);
  return !!row;
}

/** `yuna`, then `yuna2`, `yuna3`… until one is free. */
export async function availableUsername(displayName: string): Promise<string> {
  const base = suggestUsername(displayName);
  if (!(await usernameTaken(base))) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}${n}`;
    if (!(await usernameTaken(candidate))) return candidate;
  }
  return `${base}${Date.now().toString().slice(-5)}`;
}

export async function createAccount(input: {
  username: string;
  displayName: string;
  roles: ("student" | "ta" | "teacher")[];
  teamId?: string | null;
}): Promise<CreatedAccount> {
  const username = input.username.trim().toLowerCase();
  if (!isValidUsername(username)) {
    throw new Error(
      "Usernames are 2–31 characters: lowercase letters, digits, dot, dash or underscore, starting with a letter or digit.",
    );
  }
  if (await usernameTaken(username)) {
    throw new Error(`The username "${username}" is already taken.`);
  }

  const email = syntheticEmail(username);
  const password = generatePassword();
  const supabase = adminClient();

  // email_confirm: true because nothing will ever arrive to confirm — the
  // address is on a reserved .invalid domain.
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, display_name: input.displayName },
  });
  if (error || !data.user) {
    throw new Error(`Could not create the sign-in account: ${error?.message}`);
  }

  try {
    const [created] = await db
      .insert(users)
      .values({
        authId: data.user.id,
        username,
        email,
        displayName: input.displayName.trim() || username,
        roles: input.roles,
      })
      .returning();

    if (input.roles.includes("student") && input.teamId) {
      const [team] = await db.select().from(teams).where(eq(teams.id, input.teamId));
      if (team) {
        await db
          .insert(teamMembers)
          .values({ teamId: team.id, studentId: created.id })
          .onConflictDoUpdate({
            target: teamMembers.studentId,
            set: { teamId: team.id },
          });
      }
    }

    return { userId: created.id, username, password };
  } catch (e) {
    // Never leave an auth account with no roster row: the person could sign
    // in and land in a session the app cannot resolve.
    await supabase.auth.admin.deleteUser(data.user.id).catch(() => {});
    throw e;
  }
}

/** Issues a fresh password. The old one stops working immediately. */
export async function resetPassword(userId: string): Promise<string> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  if (!row) throw new Error("No such person.");
  if (!row.authId) throw new Error(`${row.displayName} has no sign-in account.`);

  const password = generatePassword();
  const { error } = await adminClient().auth.admin.updateUserById(row.authId, {
    password,
  });
  if (error) throw new Error(`Could not reset the password: ${error.message}`);
  return password;
}

/**
 * Applies a role set and, for students, their team.
 *
 * Takes ids rather than a session and performs no caller check: the server
 * action establishes that the caller is the teacher and that they are not
 * editing themselves, then delegates here. Keeping the write separate is what
 * lets it be exercised outside a request.
 *
 * The last-teacher guard lives here rather than in the action because it is a
 * data invariant — it must hold however the write is reached.
 */
export async function applyRolesAndTeam(
  userId: string,
  roles: ("student" | "ta" | "teacher")[],
  teamId?: string | null,
): Promise<{ displayName: string; teamName: string | null }> {
  if (roles.length === 0) throw new Error("Pick at least one role.");

  const [existing] = await db.select().from(users).where(eq(users.id, userId));
  if (!existing) throw new Error("No such person.");

  if (existing.roles.includes("teacher") && !roles.includes("teacher")) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`'teacher' = any(${users.roles})`);
    if (n <= 1) throw new Error("That is the only teacher account.");
  }

  const [updated] = await db
    .update(users)
    .set({ roles })
    .where(eq(users.id, userId))
    .returning();

  // Only someone who is still a student belongs to a team; a team id sent
  // alongside a non-student role set is ignored, not applied.
  if (!roles.includes("student")) {
    await db.delete(teamMembers).where(eq(teamMembers.studentId, userId));
    return { displayName: updated.displayName, teamName: null };
  }

  if (!teamId) return { displayName: updated.displayName, teamName: null };

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return { displayName: updated.displayName, teamName: null };

  await db
    .insert(teamMembers)
    .values({ teamId: team.id, studentId: userId })
    .onConflictDoUpdate({
      target: teamMembers.studentId,
      set: { teamId: team.id },
    });

  return { displayName: updated.displayName, teamName: team.name };
}

export type AccountImpact = {
  displayName: string;
  username: string;
  roles: ("student" | "ta" | "teacher")[];
  testAttempts: number;
  testAnswers: number;
  practiceRuns: number;
  practiceAnswers: number;
  weeklyReports: number;
  /** Teams this person is the TA for; those teams lose their TA, not their members. */
  teamsLedAsTa: number;
};

/**
 * What deleting this person would destroy.
 *
 * Every one of these cascades, so the warning can state real numbers rather
 * than "this cannot be undone" in the abstract. A teacher deleting a student
 * in week 9 should see that nine weeks of results go with them.
 */
export async function accountImpact(userId: string): Promise<AccountImpact | null> {
  /*
   * The id is bound as a parameter rather than written as `${users.id}`.
   *
   * Drizzle only qualifies a column reference as "users"."id" when more than
   * one table is in scope; with a single `.from(users)` it emits a bare "id",
   * which Postgres then resolves against the *subquery's* table — `attempts`
   * has an `id`, so `a.student_id = "id"` silently became `a.student_id = a.id`
   * and counted nothing. No error, just zeros.
   */
  const id = sql`${userId}::uuid`;

  const [row] = await db
    .select({
      displayName: users.displayName,
      username: users.username,
      roles: users.roles,
      testAttempts: sql<number>`(select count(*) from attempts a where a.student_id = ${id})::int`,
      testAnswers: sql<number>`(select count(*) from responses r where r.student_id = ${id})::int`,
      practiceRuns: sql<number>`(select count(*) from practice_runs p where p.student_id = ${id})::int`,
      practiceAnswers: sql<number>`(select count(*) from practice_responses pr where pr.student_id = ${id})::int`,
      weeklyReports: sql<number>`(select count(*) from weekly_reports w where w.student_id = ${id})::int`,
      teamsLedAsTa: sql<number>`(select count(*) from teams t where t.ta_id = ${id})::int`,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row ?? null;
}

/**
 * Removes the sign-in account and the roster row. Everything belonging to the
 * person cascades; records that merely *reference* them (who approved a test,
 * who granted a retake) are nulled rather than deleted, so the test itself
 * survives its approver leaving.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  if (!row) return;
  if (row.authId) {
    await adminClient().auth.admin.deleteUser(row.authId).catch(() => {});
  }
  await db.delete(users).where(eq(users.id, userId));
}

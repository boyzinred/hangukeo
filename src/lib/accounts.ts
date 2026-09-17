import { createClient } from "@supabase/supabase-js";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { teamMembers, teams, users } from "@/db/schema";
import type { Role } from "@/db/schema";
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

/**
 * Which Supabase project a URL belongs to.
 *
 * A hosted database URL carries the project ref in the username —
 * `postgres.abcdefgh@aws-0-….pooler.supabase.com` — and the API URL carries it
 * as the subdomain of `https://abcdefgh.supabase.co`. Local is its own answer.
 * Returns null when it cannot tell, which is treated as "do not object".
 */
function projectRef(url: string | undefined): string | null {
  if (!url) return null;
  if (url.includes("127.0.0.1") || url.includes("localhost")) return "local";
  const fromUsername = url.match(/\/\/postgres\.([a-z0-9]+):/i)?.[1];
  if (fromUsername) return fromUsername.toLowerCase();
  const fromHost = url.match(/\/\/([a-z0-9]+)\.supabase\.(co|in)/i)?.[1];
  return fromHost ? fromHost.toLowerCase() : null;
}

/**
 * The service-key client, checked against the database it will be paired with.
 *
 * An account is two writes to two systems: the auth user goes to Supabase Auth
 * and the roster row goes to Postgres. If the two env vars name different
 * projects — the easiest mistake to make when a cloud env file inherits half
 * its values from the shell — both writes succeed and the account is broken in
 * a way nothing later complains about: the person can sign in and the app
 * cannot find them, or the roster shows someone who has no way in.
 */
/**
 * Checks the environment can create accounts, before anything is attempted.
 *
 * Exported so a command-line entry point can call it first: finding out that
 * the service key is missing *after* a database round trip means the error
 * arrives as a failed query about something else entirely.
 */
export function assertAdminEnv(): { apiUrl: string; key: string } {
  const key = process.env.SUPABASE_SECRET_KEY;
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!key) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set. It belongs in the same env file as the " +
        "DATABASE_URL you are targeting — Supabase dashboard → Project Settings " +
        "→ API keys → service_role.",
    );
  }
  if (!apiUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set. It belongs in the same env file as " +
        "the DATABASE_URL you are targeting — Supabase dashboard → Project " +
        "Settings → Data API → Project URL.",
    );
  }

  // The dashboard shows the project URL beside REST and GraphQL endpoints
  // built on top of it, and the wrong one is a plausible copy. Supabase
  // answers the resulting request with "Invalid path specified in request
  // URL", which names neither the value nor the file it came from.
  const path = apiUrl.replace(/^https?:\/\/[^/]+/, "").replace(/\/+$/, "");
  if (path) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL should be the project URL with no path, but it ends in "${path}". ` +
        `Use ${apiUrl.match(/^https?:\/\/[^/]+/)?.[0] ?? "https://<project-ref>.supabase.co"} — ` +
        "the REST and GraphQL endpoints shown next to it on the same dashboard page are built from it, not used directly.",
    );
  }

  const dbRef = projectRef(process.env.DATABASE_URL);
  const apiRef = projectRef(apiUrl);
  if (dbRef && apiRef && dbRef !== apiRef) {
    throw new Error(
      `Refusing to act: the database is project "${dbRef}" and the Supabase API ` +
        `is project "${apiRef}". The sign-in account and the roster row would be ` +
        "created on different projects, which nothing later would flag.",
    );
  }

  return { apiUrl, key };
}

function adminClient() {
  const { apiUrl, key } = assertAdminEnv();
  return createClient(apiUrl, key, {
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
  roles: Role[];
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
/**
 * Issues a password, creating the sign-in account if the person has never had
 * one.
 *
 * A roster row can exist without an auth user: the seed writes the roster and
 * leaves sign-in accounts to be issued, and an interrupted `createAccount`
 * leaves the same shape behind. This used to refuse those rows outright, which
 * left them stranded — the teacher could not give them a password, and could
 * not create them again either, because the username was taken by the row
 * standing in the way.
 *
 * Whether it created or reset is returned rather than inferred, so the screen
 * can say which happened. Telling someone their password was "reset" when they
 * never had one is a small lie that makes them look for an older email.
 */
export async function resetPassword(
  userId: string,
): Promise<{ password: string; created: boolean }> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  if (!row) throw new Error("No such person.");

  const password = generatePassword();
  const admin = adminClient();

  if (!row.authId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: row.email,
      password,
      email_confirm: true,
      user_metadata: { username: row.username, display_name: row.displayName },
    });
    if (error || !data.user) {
      throw new Error(
        `Could not create the sign-in account: ${error?.message ?? "no user returned"}`,
      );
    }
    await db
      .update(users)
      .set({ authId: data.user.id })
      .where(eq(users.id, userId));
    return { password, created: true };
  }

  const { error } = await admin.auth.admin.updateUserById(row.authId, {
    password,
  });
  if (error) throw new Error(`Could not reset the password: ${error.message}`);
  return { password, created: false };
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
  roles: Role[],
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
  roles: Role[];
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

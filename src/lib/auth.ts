import { eq } from "drizzle-orm";
import { db } from "@/db";
import { classSettings, teamMembers, teams, users } from "@/db/schema";

/**
 * STUB. Magic-link auth against the allowlist is the next phase; this resolves
 * a seeded user so the learning screens can be built and reviewed.
 *
 * Every caller goes through these helpers rather than reading `users` directly,
 * so swapping in a real Supabase session is a change to this file alone.
 */

export type Session = {
  userId: string;
  displayName: string;
  role: "student" | "ta" | "teacher";
};

export async function currentUser(): Promise<Session> {
  const [u] = await db
    .select()
    .from(users)
    .where(eq(users.role, "student"))
    .orderBy(users.createdAt)
    .limit(1);

  if (!u) throw new Error("no users — run `npm run db:seed`");
  return { userId: u.id, displayName: u.displayName, role: u.role };
}

/** STUB, as above — resolves the seeded teacher for the teacher screens. */
export async function currentTeacher(): Promise<Session> {
  const [u] = await db
    .select()
    .from(users)
    .where(eq(users.role, "teacher"))
    .limit(1);

  if (!u) throw new Error("no teacher — run `npm run db:seed`");
  return { userId: u.id, displayName: u.displayName, role: u.role };
}

export async function settings() {
  const [s] = await db.select().from(classSettings).limit(1);
  if (!s) throw new Error("no class settings — run `npm run db:seed`");
  return s;
}

export async function teamOf(studentId: string) {
  const [row] = await db
    .select({ teamName: teams.name, taId: teams.taId })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.studentId, studentId))
    .limit(1);
  return row ?? null;
}

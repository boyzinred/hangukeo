import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { classSettings, teamMembers, teams } from "@/db/schema";

/**
 * Class-level lookups. Session and authorization moved to `session.ts` when
 * real auth landed; this file is now just settings and team membership.
 */

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

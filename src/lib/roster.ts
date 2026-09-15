import "server-only";

import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { teamMembers, teams, users } from "@/db/schema";

export type RosterRow = {
  id: string;
  displayName: string;
  username: string;
  roles: ("student" | "ta" | "teacher")[];
  teamId: string | null;
  teamName: string | null;
  lastSignInAt: Date | null;
};

export type TeamRow = {
  id: string;
  name: string;
  taId: string | null;
  taName: string | null;
  memberCount: number;
};

export async function roster(): Promise<RosterRow[]> {
  return db
    .select({
      id: users.id,
      displayName: users.displayName,
      username: users.username,
      roles: users.roles,
      teamId: teams.id,
      teamName: teams.name,
      lastSignInAt: users.lastSignInAt,
    })
    .from(users)
    .leftJoin(teamMembers, eq(teamMembers.studentId, users.id))
    .leftJoin(teams, eq(teams.id, teamMembers.teamId))
    .orderBy(asc(users.displayName));
}

export async function teamList(): Promise<TeamRow[]> {
  return db
    .select({
      id: teams.id,
      name: teams.name,
      taId: teams.taId,
      taName: sql<string | null>`(select display_name from ${users} where ${users.id} = ${teams.taId})`,
      memberCount: sql<number>`(select count(*) from ${teamMembers} where ${teamMembers.teamId} = ${teams.id})::int`,
    })
    .from(teams)
    .orderBy(asc(teams.name));
}

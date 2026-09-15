import "server-only";

import { asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { allowlist, teamMembers, teams, users } from "@/db/schema";

export type RosterRow = {
  id: string;
  displayName: string;
  email: string;
  role: "student" | "ta" | "teacher";
  teamId: string | null;
  teamName: string | null;
  joinedAt: Date | null;
};

export type TeamRow = {
  id: string;
  name: string;
  taId: string | null;
  taName: string | null;
  memberCount: number;
};

export type PendingInvite = {
  email: string;
  displayName: string | null;
  invitedAt: Date;
};

export async function roster(): Promise<RosterRow[]> {
  return db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      role: users.role,
      teamId: teams.id,
      teamName: teams.name,
      joinedAt: teamMembers.joinedAt,
    })
    .from(users)
    .leftJoin(teamMembers, eq(teamMembers.studentId, users.id))
    .leftJoin(teams, eq(teams.id, teamMembers.teamId))
    .orderBy(asc(users.role), asc(users.displayName));
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

/** Allowlisted addresses that have not yet been claimed by a signup. */
export async function pendingInvites(): Promise<PendingInvite[]> {
  return db
    .select({
      email: allowlist.email,
      displayName: allowlist.displayName,
      invitedAt: allowlist.invitedAt,
    })
    .from(allowlist)
    .where(isNull(allowlist.claimedAt))
    .orderBy(asc(allowlist.invitedAt));
}

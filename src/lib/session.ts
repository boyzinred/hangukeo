import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { supabaseServer } from "./supabase/server";

/**
 * Data Access Layer.
 *
 * This is the application's authorization boundary. Drizzle connects as
 * `postgres`, which has BYPASSRLS, so database policies never constrain our
 * queries — every check that matters happens here and is called from the
 * server component or server action that touches the data. `proxy.ts` does an
 * optimistic cookie check only, as the Next.js docs require.
 *
 * `cache()` memoises per render pass, so a page calling requireStaff() and a
 * component calling currentSession() share one round trip.
 */

export type Role = "student" | "ta" | "teacher";

export type Session = {
  userId: string;
  authId: string;
  username: string;
  displayName: string;
  /** Additive: a student who is also a TA holds both. */
  roles: Role[];
  isStudent: boolean;
  isTa: boolean;
  isTeacher: boolean;
  /** Teacher or TA — the roles that can see other people's results. */
  isStaff: boolean;
};

export function describeRoles(roles: Role[]): Session {
  return {
    roles,
    isStudent: roles.includes("student"),
    isTa: roles.includes("ta"),
    isTeacher: roles.includes("teacher"),
    isStaff: roles.includes("ta") || roles.includes("teacher"),
  } as Session;
}

/**
 * The signed-in user, or null.
 *
 * Reads the auth user with `getUser()` rather than `getSession()`: getSession
 * trusts the cookie, getUser revalidates the JWT with Supabase. Someone
 * removed from the roster stops being a user here on their next request.
 */
export const currentSession = cache(async (): Promise<Session | null> => {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.authId, user.id))
    .limit(1);

  // Authenticated with Supabase but not linked to a roster row — treat as
  // signed out rather than guessing who they are.
  if (!row) return null;

  const roles = row.roles as Role[];
  return {
    userId: row.id,
    authId: user.id,
    username: row.username,
    displayName: row.displayName,
    roles,
    isStudent: roles.includes("student"),
    isTa: roles.includes("ta"),
    isTeacher: roles.includes("teacher"),
    isStaff: roles.includes("ta") || roles.includes("teacher"),
  };
});

export async function requireSession(): Promise<Session> {
  const s = await currentSession();
  if (!s) redirect("/login");
  return s;
}

/** Any signed-in person. The student screens hold nothing privileged. */
export async function requireStudent(): Promise<Session> {
  return requireSession();
}

/** Teacher or TA — the roles that can see other people's results. */
export async function requireStaff(): Promise<Session> {
  const s = await requireSession();
  if (!s.isStaff) redirect("/");
  return s;
}

/** Teacher only — accounts, promotion, deletion, class settings. */
export async function requireTeacher(): Promise<Session> {
  const s = await requireSession();
  if (!s.isTeacher) redirect("/");
  return s;
}

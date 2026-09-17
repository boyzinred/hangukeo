import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { supabaseServer } from "./supabase/server";
import { describeRoles as flagsFor } from "./roles";
import type { Role } from "@/db/schema";

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

export { describeRoles } from "./roles";
export type { Role };

/**
 * Which account an admin is currently browsing as.
 *
 * The cookie holds a user id and nothing else — no token, no claim, no
 * signature. It does not need one: it *selects* an identity, it does not grant
 * one. Every request re-derives authority from the real Supabase session, so a
 * forged cookie does nothing unless the person holding it is already an admin,
 * and an admin forging it has gained precisely what the button would have
 * given them anyway. Signing it would look more careful while protecting
 * nothing.
 */
const VIEW_AS = "hangukeo-view-as";

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
  isAdmin: boolean;
  /** Teacher or TA — the roles that can see other people's results. */
  isStaff: boolean;
};


/**
 * Who is actually signed in — never the account an admin is looking at.
 *
 * Reads the auth user with `getUser()` rather than `getSession()`: getSession
 * trusts the cookie, getUser revalidates the JWT with Supabase. Someone
 * removed from the roster stops being a user here on their next request.
 *
 * Everything that decides whether impersonation is allowed reads this. Screens
 * read `currentSession()` instead, so they behave as the account being viewed.
 */
export const realSession = cache(async (): Promise<Session | null> => {
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

  return sessionFor(row, user.id);
});

function sessionFor(
  row: typeof users.$inferSelect,
  authId: string,
): Session {
  const roles = row.roles as Role[];
  return {
    ...flagsFor(roles),
    userId: row.id,
    authId,
    username: row.username,
    displayName: row.displayName,
    roles,
  };
}

export type Viewing = {
  /** The admin who is looking. */
  admin: Session;
  /** The account they are looking at. */
  as: Session;
};

/**
 * The impersonation in effect, if any.
 *
 * Returns null the moment any part of it stops holding — not an admin any
 * more, the cookie names an account that has been deleted, or it names
 * themselves. The cookie is left in place rather than cleared: reading is not
 * the place to write, and an ignored cookie is already inert.
 */
export const viewingAs = cache(async (): Promise<Viewing | null> => {
  const real = await realSession();
  if (!real?.isAdmin) return null;

  const jar = await cookies();
  const targetId = jar.get(VIEW_AS)?.value;
  if (!targetId || targetId === real.userId) return null;

  const [row] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  if (!row) return null;

  return { admin: real, as: sessionFor(row, real.authId) };
});

/**
 * The identity the screens should behave as.
 *
 * For everybody except an admin mid-impersonation this is simply who they are,
 * which is why every existing caller was left alone.
 */
export const currentSession = cache(async (): Promise<Session | null> => {
  const viewing = await viewingAs();
  return viewing ? viewing.as : realSession();
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

/**
 * Admin only, and always the real one.
 *
 * Deliberately reads `realSession`: viewing as an admin must not confer the
 * power to start viewing as somebody else, or one impersonation could be
 * chained into another and the record of who did what would be lost.
 */
export async function requireAdmin(): Promise<Session> {
  const s = await realSession();
  if (!s) redirect("/login");
  if (!s.isAdmin) redirect("/");
  return s;
}

/**
 * Refuses an action while an admin is viewing as somebody else.
 *
 * Browsing as a person is for seeing what they see. Changing their password or
 * deleting an account from inside their session would record the act against
 * them, and the one thing an impersonation feature must never do is make the
 * wrong person look responsible.
 */
export async function refuseWhileViewing(what: string): Promise<void> {
  const viewing = await viewingAs();
  if (viewing) {
    throw new Error(
      `${what} is not available while viewing as ${viewing.as.displayName}. Stop viewing first so the action is recorded against you.`,
    );
  }
}

/** Sets or clears the account an admin is viewing as. */
export async function setViewingAs(userId: string | null): Promise<void> {
  const jar = await cookies();
  if (userId === null) jar.delete(VIEW_AS);
  else {
    jar.set(VIEW_AS, userId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      // Off locally, where there is no HTTPS to send it over.
      secure: process.env.NODE_ENV === "production",
      // Ends with the browser session: an admin who closes the tab should come
      // back as themselves rather than silently still being somebody else.
      maxAge: undefined,
    });
  }
}

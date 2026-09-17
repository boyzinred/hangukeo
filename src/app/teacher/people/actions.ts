"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { refuseWhileViewing, requireAccountAdmin } from "@/lib/session";
import {
  accountImpact,
  applyRolesAndTeam,
  availableUsername,
  createAccount,
  deleteAccount,
  resetPassword,
  type AccountImpact,
} from "@/lib/accounts";

/**
 * Every action re-checks the teacher role. Server Actions are reachable by
 * direct POST, so the page having rendered for a teacher proves nothing about
 * who is calling — and these actions hold the service key, which can do
 * anything.
 */

export type { AccountImpact };

// Re-exported so the client components keep one import site.
import type { Role } from "@/db/schema";
export type { Role };
const ALL_ROLES: Role[] = ["student", "ta", "teacher"];

export type ActionResult =
  | { ok: true; message: string; credential?: { username: string; password: string } }
  | { ok: false; error: string };

/** Offered in the form so the teacher can see the username before committing. */
export async function proposeUsername(displayName: string): Promise<string> {
  await requireAccountAdmin();
  return availableUsername(displayName);
}

export async function createStudentAccount(
  formData: FormData,
): Promise<ActionResult> {
  await requireAccountAdmin();
  await refuseWhileViewing("Creating an account");

  const displayName = String(formData.get("displayName") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const roles = formData.getAll("roles").map(String) as Role[];
  const teamId = String(formData.get("teamId") ?? "");

  if (!displayName) return { ok: false, error: "Enter a display name." };
  if (roles.length === 0) return { ok: false, error: "Pick at least one role." };
  if (roles.some((r) => !ALL_ROLES.includes(r))) {
    return { ok: false, error: "Unknown role." };
  }

  try {
    const account = await createAccount({
      username: username || (await availableUsername(displayName)),
      displayName,
      roles,
      teamId: roles.includes("student") ? teamId || null : null,
    });
    revalidatePath("/teacher/people");
    revalidatePath("/teacher/home");
    return {
      ok: true,
      message: `Created ${displayName} as ${roles.join(" + ")}.`,
      credential: { username: account.username, password: account.password },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}

export async function resetUserPassword(
  formData: FormData,
): Promise<ActionResult> {
  const me = await requireAccountAdmin();
  await refuseWhileViewing("Resetting a password");
  const userId = String(formData.get("userId") ?? "");

  try {
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    if (!row) return { ok: false, error: "No such person." };
    if (row.id === me.userId) {
      // Resetting your own password here would sign you out mid-action with
      // a password only visible on the page you are being redirected from.
      return { ok: false, error: "Use a second teacher account to reset your own password." };
    }

    const { password, created } = await resetPassword(userId);
    revalidatePath("/teacher/people");
    return {
      ok: true,
      message: created
        ? `Sign-in account created for ${row.displayName}.`
        : `New password for ${row.displayName}.`,
      credential: { username: row.username, password },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}

export async function fetchAccountImpact(userId: string) {
  await requireAccountAdmin();
  return accountImpact(userId);
}

/**
 * Deletes a person and everything they produced.
 *
 * Guarded four ways, because this is the only irreversible action in the app:
 * it is refused outright while an admin is viewing as somebody else, and then
 * the caller must be a teacher, must not be deleting themselves, must not be
 * removing the last teacher, and must retype the username exactly. The typed
 * confirmation is the one that actually stops a misclick.
 */
export async function deleteUserAccount(
  formData: FormData,
): Promise<ActionResult> {
  const me = await requireAccountAdmin();
  await refuseWhileViewing("Deleting an account");
  const userId = String(formData.get("userId") ?? "");
  const confirmation = String(formData.get("confirm") ?? "").trim();

  const [row] = await db.select().from(users).where(eq(users.id, userId));
  if (!row) return { ok: false, error: "No such person." };

  if (row.id === me.userId) {
    return { ok: false, error: "You cannot delete your own account." };
  }
  if (confirmation.toLowerCase() !== row.username.toLowerCase()) {
    return {
      ok: false,
      error: `Type "${row.username}" exactly to confirm.`,
    };
  }
  if ((row.roles as Role[]).includes("teacher") && !me.isAdmin) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`'teacher' = any(${users.roles})`);
    if (n <= 1) {
      // A teacher removing the last teacher locks the class out with nobody
      // able to undo it. An admin can appoint another, so the guard would only
      // be in the way of the person whose job this is.
      return {
        ok: false,
        error: "That is the only teacher account — nobody could administer the class.",
      };
    }
  }

  try {
    await deleteAccount(userId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed." };
  }

  revalidatePath("/teacher/people");
  revalidatePath("/teacher/home");
  return { ok: true, message: `Deleted ${row.displayName} and all their results.` };
}

/**
 * Replaces someone's whole role set, and their team along with it.
 *
 * Roles and team move together because they are one decision: a team only
 * means anything for someone holding the student role, so applying them
 * separately would let the UI produce a state — TA-only, still on a team —
 * that this action would immediately undo.
 */
export async function setRoles(formData: FormData): Promise<ActionResult> {
  const me = await requireAccountAdmin();
  await refuseWhileViewing("Changing roles");
  const userId = String(formData.get("userId") ?? "");
  const roles = formData.getAll("roles").map(String) as Role[];
  const teamId = String(formData.get("teamId") ?? "");

  if (roles.length === 0) return { ok: false, error: "Pick at least one role." };
  if (roles.some((r) => !ALL_ROLES.includes(r))) {
    return { ok: false, error: "Unknown role." };
  }
  if (userId === me.userId) {
    return { ok: false, error: "You cannot change your own roles." };
  }

  try {
    const { displayName, teamName } = await applyRolesAndTeam(
      userId,
      roles,
      teamId || null,
    );
    revalidatePath("/teacher/people");
    revalidatePath("/teacher/home");
    return {
      ok: true,
      message: `${displayName} is now ${roles.join(" + ")}${teamName ? ` on ${teamName}` : ""}.`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}


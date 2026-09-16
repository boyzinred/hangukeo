"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin, setViewingAs, viewingAs } from "@/lib/session";

/**
 * Starting and stopping impersonation.
 *
 * `requireAdmin` reads the real session, not the viewed one, so viewing as an
 * admin cannot be chained into viewing as somebody else. Without that, two
 * hops would leave no way to say who was actually at the keyboard.
 */

export async function viewAs(userId: string): Promise<void> {
  const me = await requireAdmin();

  if (userId === me.userId) {
    // Viewing as yourself is just being yourself, and leaving the cookie set
    // would show the banner over an ordinary session.
    await setViewingAs(null);
    redirect("/admin");
  }

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw new Error("No such account.");

  await setViewingAs(userId);
  revalidatePath("/", "layout");

  // Land wherever that person's own work lives, which is the point of looking.
  const roles = target.roles as string[];
  redirect(roles.includes("student") ? "/bank" : roles.includes("teacher") || roles.includes("ta") ? "/teacher/home" : "/");
}

export async function stopViewing(): Promise<void> {
  // Deliberately not admin-gated: whoever this cookie belongs to, letting them
  // put it down can only ever reduce what they can reach.
  await setViewingAs(null);
  revalidatePath("/", "layout");
  redirect("/admin");
}

/** Where the banner's "back to admin" goes, without clearing the view. */
export async function currentlyViewing() {
  return viewingAs();
}

"use server";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { supabaseServer } from "@/lib/supabase/server";

export type LoginResult = { ok: false; error: string };

/**
 * Username + password sign-in.
 *
 * The username is resolved to its synthetic address here rather than in the
 * browser, so the address scheme is never exposed and a student cannot sign
 * in by guessing the email format directly.
 *
 * Failures return one message whether the username exists or not — otherwise
 * the form becomes a way to enumerate the class roster.
 */
export async function signIn(formData: FormData): Promise<LoginResult> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const wrong: LoginResult = {
    ok: false,
    error: "That username and password do not match. Ask your teacher to reset it if you are stuck.",
  };

  if (!username || !password) {
    return { ok: false, error: "Enter your username and password." };
  }

  const [row] = await db
    .select({ email: users.email, id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.username})`, username))
    .limit(1);

  if (!row) return wrong;

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email: row.email,
    password,
  });

  if (error) return wrong;

  // Lets the teacher see who has never signed in.
  await db
    .update(users)
    .set({ lastSignInAt: new Date() })
    .where(eq(users.id, row.id));

  redirect("/");
}

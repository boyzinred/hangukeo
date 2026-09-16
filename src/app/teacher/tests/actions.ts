"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { attempts, tests } from "@/db/schema";
import { requireStaff, requireTeacher } from "@/lib/session";
import { auditTest } from "@/lib/test-import";
import { deleteTest, setTestStatus } from "@/lib/tests";

export type TestActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Publishing is the teacher's decision; a TA reviews but does not decide what
 * the class sits. Each action re-checks, since a Server Action is reachable by
 * direct POST regardless of who the page rendered for.
 *
 * Nothing here creates a test. Tests are written as files and imported with
 * `npm run test:import`; these actions move one through its lifecycle.
 */

/** How many people have started this test — the guard on every destructive move. */
async function attemptCount(testId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(attempts)
    .where(eq(attempts.testId, testId));
  return n;
}

/**
 * Publishing re-runs the validator against what is actually stored.
 *
 * The file was checked at import, but that may have been days ago and the
 * corpus can move underneath it. This is the last moment before students see
 * it, so it is the right place to refuse a test that would score without
 * feeding studied, verified or retention.
 */
export async function publishTest(testId: string): Promise<TestActionResult> {
  const me = await requireTeacher();

  const audit = await auditTest(testId);
  if (!audit.ok) {
    const errors = audit.findings.filter((f) => f.level === "error");
    return {
      ok: false,
      error: `Cannot publish — ${errors.map((f) => f.message).join(" ")}`,
    };
  }

  await setTestStatus(testId, "published", me.userId);
  revalidatePath("/teacher/tests");
  revalidatePath(`/teacher/tests/${testId}`);
  revalidatePath("/test");
  return { ok: true, message: "Published — students can sit it now." };
}

export async function unpublishTest(testId: string): Promise<TestActionResult> {
  await requireTeacher();

  // Pulling a test out from under someone mid-sitting would strand their
  // attempt, so this only works before anyone has started.
  const n = await attemptCount(testId);
  if (n > 0) {
    return {
      ok: false,
      error: `${n} student${n === 1 ? " has" : "s have"} already started this test. Close it instead.`,
    };
  }

  await setTestStatus(testId, "review");
  revalidatePath("/teacher/tests");
  revalidatePath(`/teacher/tests/${testId}`);
  revalidatePath("/test");
  return { ok: true, message: "Back to review — students can no longer see it." };
}

/**
 * Closes a test for good.
 *
 * Without this a published test stays sittable forever, and a student who
 * missed week 2 could sit it in week 6 with the answers already studied. The
 * score would count, and every figure drawn from it would be a lie. Closing
 * keeps the results readable in history while ending new attempts.
 */
export async function closeTest(testId: string): Promise<TestActionResult> {
  await requireTeacher();
  await setTestStatus(testId, "closed");
  revalidatePath("/teacher/tests");
  revalidatePath(`/teacher/tests/${testId}`);
  revalidatePath("/test");
  return {
    ok: true,
    message: "Closed — results stay visible, but nobody can start it now.",
  };
}

export async function discardTest(testId: string): Promise<TestActionResult> {
  await requireTeacher();

  const n = await attemptCount(testId);
  if (n > 0) {
    return {
      ok: false,
      error: `Cannot discard — ${n} attempt${n === 1 ? "" : "s"} would be deleted with it.`,
    };
  }

  const [row] = await db.select().from(tests).where(eq(tests.id, testId));
  await deleteTest(testId);
  revalidatePath("/teacher/tests");
  return { ok: true, message: `Discarded ${row?.title ?? "the test"}.` };
}

/** A TA who has read a draft marks it ready for the teacher to decide on. */
export async function markForReview(testId: string): Promise<TestActionResult> {
  await requireStaff();
  await setTestStatus(testId, "review");
  revalidatePath("/teacher/tests");
  revalidatePath(`/teacher/tests/${testId}`);
  return { ok: true, message: "Marked as read — ready for the teacher." };
}

"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/session";
import { resolveFlag } from "@/lib/review";

export type ReviewResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Grading a flagged answer is a TA's job as much as a teacher's — it is
 * reading, not deciding what the class sits. `requireStaff` covers both, and
 * re-checks here because a Server Action is reachable by direct POST whoever
 * the page rendered for.
 */
export async function resolve(input: {
  questionId: string;
  answer: string;
  accept: boolean;
  teachGrader: boolean;
}): Promise<ReviewResult> {
  await requireStaff();

  try {
    const { resolved, rescored, taught } = await resolveFlag(input);
    if (resolved === 0) {
      return { ok: false, error: "Someone else has already settled that one." };
    }

    revalidatePath("/teacher/review");
    revalidatePath("/teacher/tests");
    revalidatePath("/test");

    const who = `${resolved} answer${resolved === 1 ? "" : "s"}`;
    const marks = `${rescored} score${rescored === 1 ? "" : "s"} recounted`;
    return {
      ok: true,
      message: input.accept
        ? `Accepted — ${who}, ${marks}.${taught ? ` "${taught}" will pass from now on.` : ""}`
        : `Marked wrong — ${who}, ${marks}.`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}

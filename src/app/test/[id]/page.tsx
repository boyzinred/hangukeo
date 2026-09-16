import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { attempts } from "@/db/schema";
import { requireStudent } from "@/lib/session";
import { testDetail } from "@/lib/tests";
import { attemptResult } from "@/lib/test-taking";
import { TestResult } from "../result";
import { TestRunner } from "../test-runner";

export const metadata = { title: "Test · hangukeo" };

/**
 * One test: sitting it, or reading back the one already sat.
 *
 * Addressed by id rather than by "the current week" so a student can open week
 * 2 in week 6 and see what they were asked. Whether they can still *sit* it is
 * the test's status, not the calendar — a closed test reads but does not open.
 */
export default async function SitOrReview({
  params,
}: PageProps<"/test/[id]">) {
  const me = await requireStudent();
  const { id } = await params;

  const test = await testDetail(id);
  // A draft is not a test as far as a student is concerned — it does not exist
  // until the teacher publishes it.
  if (!test || test.status === "draft" || test.status === "review") notFound();

  const [latest] = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.testId, test.id), eq(attempts.studentId, me.userId)))
    .orderBy(desc(attempts.attemptNumber))
    .limit(1);

  const result =
    latest?.state === "submitted"
      ? await attemptResult(me.userId, latest.id)
      : null;

  return (
    <main className="shell">
      <section className="hero">
        <span className="kicker">Week {test.weekNumber}</span>
        <h1>{test.title}</h1>
        <p>
          {result
            ? `You sat this in week ${test.weekNumber}. Here is every question and what you answered.`
            : `${test.questions.length} questions, ${test.timeLimitMinutes} minutes.`}
        </p>
      </section>

      <div className="section-body">
        <div className="teacher-toolbar">
          <span className="small">
            {test.status === "closed" ? "This test is closed." : "Open"}
          </span>
          <Link className="btn secondary" href="/test">
            All tests
          </Link>
        </div>

        {result ? (
          <TestResult result={result} />
        ) : test.status === "published" ? (
          <TestRunner
            testId={test.id}
            title={test.title}
            timeLimitMinutes={test.timeLimitMinutes}
            questionCount={test.questions.length}
          />
        ) : (
          <p className="small">
            The week {test.weekNumber} test closed and you did not sit it. Ask
            your teacher whether it can be reopened for you.
          </p>
        )}
      </div>
    </main>
  );
}

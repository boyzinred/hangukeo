import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { questions, tests, weekPlans } from "@/db/schema";
import { settings } from "@/lib/auth";
import { plannedWeekCount } from "@/lib/bank";
import { weekNumberFor } from "@/lib/bank-shared";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Tests · hangukeo" };

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  review: "Read, awaiting the teacher",
  published: "Open to students",
  closed: "Closed",
};

type Spec = {
  vocabNew?: number;
  vocabReview?: number;
  grammar?: number;
  reading?: number;
  reviewSharePct?: number;
};

export default async function TeacherTests() {
  const [me, s] = await Promise.all([requireStaff(), settings()]);
  const totalWeeks = await plannedWeekCount();
  const currentWeek = weekNumberFor(new Date(), s.termStart, totalWeeks);

  // Every planned week, with its test if one has been imported — so a week
  // without one is a visible gap rather than simply absent from the list.
  const weeks = await db
    .select({
      weekNumber: weekPlans.weekNumber,
      endsOn: weekPlans.endsOn,
      testId: tests.id,
      title: tests.title,
      status: tests.status,
      spec: tests.spec,
      questionCount: sql<number>`(select count(*) from ${questions} q where q.test_id = ${tests.id})::int`,
      attemptCount: sql<number>`(select count(*) from attempts a where a.test_id = ${tests.id})::int`,
      submittedCount: sql<number>`(select count(*) from attempts a where a.test_id = ${tests.id} and a.state = 'submitted')::int`,
      flaggedCount: sql<number>`(
        select count(*) from responses r
        join attempts a on a.id = r.attempt_id
        where a.test_id = ${tests.id} and r.needs_review
      )::int`,
    })
    .from(weekPlans)
    .leftJoin(tests, eq(tests.weekPlanId, weekPlans.id))
    .orderBy(asc(weekPlans.weekNumber));

  const written = weeks.filter((w) => w.testId).length;

  return (
    <main className="shell">
      <section className="hero">
        <span className="kicker">
          Week {currentWeek} of {totalWeeks} · {me.displayName}
        </span>
        <h1>Weekly tests</h1>
        <p>
          {written} of {totalWeeks} weeks have a test. Each one samples{" "}
          {s.testVocabCount} words and {s.testGrammarCount} grammar points, with
          about {s.testReviewShare}% drawn from earlier weeks so retention can
          be measured at all, plus a reading passage.
        </p>
      </section>

      <div className="section-body">
        <div className="teacher-toolbar">
          <span className="small">
            {me.isTeacher
              ? "Open a week to read the whole test, then publish it. Students see nothing until you do."
              : "You can read any test. Publishing is the teacher's decision."}
          </span>
          <Link className="btn secondary" href="/teacher/home">
            Class progress
          </Link>
        </div>

        <ul className="week-list">
          {weeks.map((w) => {
            const spec = (w.spec ?? {}) as Spec;
            const isCurrent = w.weekNumber === currentWeek;

            return (
              <li
                key={w.weekNumber}
                className={`week-row ${isCurrent ? "is-current" : ""}`}
              >
                <div className="week-head">
                  <h3>
                    Week {w.weekNumber}
                    {isCurrent && <span className="pill pill-ok">this week</span>}
                  </h3>
                  <span className="small">ends {w.endsOn}</span>
                  {w.status && (
                    <span className={`pill status-${w.status}`}>
                      {STATUS_LABEL[w.status]}
                    </span>
                  )}
                </div>

                {w.testId ? (
                  <>
                    <p className="small week-detail">
                      {w.questionCount} questions
                      {spec.vocabNew !== undefined && (
                        <>
                          {" · "}
                          {spec.vocabNew} new, {spec.vocabReview} review,{" "}
                          {spec.grammar} grammar, {spec.reading} reading
                        </>
                      )}
                      {w.attemptCount > 0 && (
                        <>
                          {" · "}
                          {w.submittedCount} of {w.attemptCount} submitted
                        </>
                      )}
                      {w.flaggedCount > 0 && (
                        <>
                          {" · "}
                          <Link href={`/teacher/review?test=${w.testId}`}>
                            <strong>{w.flaggedCount} answers waiting</strong>
                          </Link>
                        </>
                      )}
                    </p>
                    <div className="row-actions">
                      <Link
                        className="btn primary compact"
                        href={`/teacher/tests/${w.testId}`}
                      >
                        {me.isTeacher && (w.status === "draft" || w.status === "review")
                          ? "Read and publish"
                          : "Read the test"}
                      </Link>
                    </div>
                  </>
                ) : (
                  <p className="small week-detail">
                    Not written yet. Tests are authored as a file and imported:{" "}
                    <code>npm run test:brief -- --week {w.weekNumber}</code>{" "}
                    prints the week&apos;s word ids to write against, then{" "}
                    <code>
                      npm run test:import -- --week {w.weekNumber} --apply
                    </code>{" "}
                    brings it in as a draft.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}

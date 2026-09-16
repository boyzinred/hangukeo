import Link from "next/link";
import { requireStaff } from "@/lib/session";
import { flaggedQueue, namedTest, testsWithFlags } from "@/lib/review";
import { ReviewQueue } from "./review-queue";

export const metadata = { title: "Grading queue · hangukeo" };

/**
 * Answers the grader could not settle, waiting on a person.
 *
 * Until one is settled it counts for nothing: studied, verified and retention
 * all exclude flagged responses, so an unread queue is not a backlog of small
 * corrections — it is a hole in every number on the class screens.
 */
export default async function ReviewPage({
  searchParams,
}: PageProps<"/teacher/review">) {
  const me = await requireStaff();
  const { test } = await searchParams;
  const only = typeof test === "string" ? test : undefined;

  const [queue, tests, named] = await Promise.all([
    flaggedQueue(only),
    testsWithFlags(),
    only ? namedTest(only) : Promise.resolve(null),
  ]);

  const answers = queue.length;
  const responses = queue.reduce((n, g) => n + g.students.length, 0);
  // A test with nothing waiting is absent from testsWithFlags, which is most
  // of them now — so the name comes from the test itself, not from the filter.
  const chosen = named ?? tests.find((t) => t.id === only) ?? null;

  return (
    <main className="shell">
      <section className="hero">
        <span className="kicker">{me.displayName}</span>
        <h1>Grading queue</h1>
        <p>
          {responses === 0 ? (
            chosen ? (
              `Nothing waiting on the week ${chosen.weekNumber} test.`
            ) : (
              "Nothing waiting. Every typed answer on every test has been settled."
            )
          ) : (
            <>
              {responses} answer{responses === 1 ? "" : "s"} the grader could
              not settle, from {answers} distinct spelling
              {answers === 1 ? "" : "s"}. Until you decide, none of them count
              toward studied, verified or retention.
            </>
          )}
        </p>
      </section>

      <div className="section-body">
        <div className="teacher-toolbar">
          <span className="small">
            {chosen
              ? `${chosen.title} only.`
              : "Every test with something waiting."}
          </span>
          {/* Back to the test this came from, not the list: you got here
              from one, and that is where the decision belongs. */}
          <Link
            className="btn secondary"
            href={only ? `/teacher/tests/${only}` : "/teacher/tests"}
          >
            {chosen ? `Back to week ${chosen.weekNumber}` : "Tests"}
          </Link>
        </div>

        {tests.length > 1 && (
          <div className="row-actions filter-row">
            <Link
              className={`btn compact ${only ? "secondary" : "primary"}`}
              href="/teacher/review"
            >
              All tests
            </Link>
            {tests.map((t) => (
              <Link
                key={t.id}
                className={`btn compact ${only === t.id ? "primary" : "secondary"}`}
                href={`/teacher/review?test=${t.id}`}
              >
                Week {t.weekNumber}
              </Link>
            ))}
          </div>
        )}

        {responses === 0 ? (
          <p className="small">
            Nothing to do here. Answers land in this queue when a student types
            something the grader cannot match — a synonym, a different phrasing,
            a near miss. Multiple choice never appears, because a wrong option
            is simply wrong, which is why a test made entirely of it leaves this
            screen empty.
          </p>
        ) : (
          <ReviewQueue items={queue} />
        )}
      </div>
    </main>
  );
}

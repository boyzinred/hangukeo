import Link from "next/link";
import { settings } from "@/lib/auth";
import { plannedWeekCount } from "@/lib/bank";
import { weekNumberFor } from "@/lib/bank-shared";
import { requireStudent } from "@/lib/session";
import { studentTestHistory, testForWeek } from "@/lib/tests";

export const metadata = { title: "Tests · hangukeo" };

/**
 * This week's test, and every test already sat.
 *
 * The weekly test used to be the whole page, which meant it vanished the
 * moment the calendar rolled over — a student could not look back at what they
 * had been asked, or at what they got wrong. Past tests are the more useful
 * half of this screen over a term.
 */
export default async function TestIndex() {
  const [me, s] = await Promise.all([requireStudent(), settings()]);
  const totalWeeks = await plannedWeekCount();
  const week = weekNumberFor(new Date(), s.termStart, totalWeeks);

  const [current, history] = await Promise.all([
    testForWeek(week),
    studentTestHistory(me.userId),
  ]);

  const currentVisible =
    current && (current.status === "published" || current.status === "closed");
  // Everything except this week's. Usually all earlier, but a teacher who
  // publishes ahead puts a later week in here too, so nothing is called past.
  const others = history.filter((h) => h.weekNumber !== week);
  const sat = others.filter((h) => h.state === "submitted").length;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="shell">
      <section className="hero">
        <span className="kicker">
          Week {week} of {totalWeeks}
        </span>
        <h1>Weekly tests</h1>
        <p>
          {currentVisible
            ? `This week's test is ${current.status === "published" ? "open" : "closed"}. `
            : "This week's test is not open yet. "}
          {sat > 0
            ? `You have sat ${sat} earlier test${sat === 1 ? "" : "s"}; they stay here to look back on.`
            : "Tests you sit stay here so you can look back at them."}
        </p>
      </section>

      <div className="section-body">
        <h2 className="section-heading">This week</h2>
        {!current ? (
          <p className="small">
            No test for week {week} yet. Practise your bank in the meantime —
            that is what the test draws from.
          </p>
        ) : !currentVisible ? (
          <p className="small">
            The week {week} test is written but not open yet. It becomes
            available once your teacher publishes it.
          </p>
        ) : (
          <TestCard
            href={`/test/${current.id}`}
            title={current.title}
            weekNumber={week}
            line={
              history.find((h) => h.id === current.id)?.state === "submitted"
                ? scoreLine(history.find((h) => h.id === current.id)!)
                : `${current.questionCount} questions, ${current.timeLimitMinutes} minutes`
            }
            cta={
              history.find((h) => h.id === current.id)?.state === "submitted"
                ? "See your answers"
                : current.status === "published"
                  ? "Sit the test"
                  : "Read it back"
            }
          />
        )}

        <h2 className="section-heading">Other weeks</h2>
        {others.length === 0 ? (
          <p className="small">Nothing yet — this is your first week of tests.</p>
        ) : (
          <ul className="week-list">
            {others.map((h) => (
              <li key={h.id} className="week-row">
                <div className="week-head">
                  <h3>Week {h.weekNumber}</h3>
                  <span className="small">
                    {h.endsOn < today ? "ended" : "ends"} {h.endsOn}
                  </span>
                  {h.state === "submitted" ? (
                    <span className="pill pill-ok">
                      {h.score} / {h.maxScore}
                    </span>
                  ) : h.status === "closed" ? (
                    <span className="pill pill-behind">not sat</span>
                  ) : (
                    <span className="pill status-published">still open</span>
                  )}
                </div>
                <p className="small week-detail">
                  {h.state === "submitted"
                    ? scoreLine(h)
                    : h.status === "closed"
                      ? "This test closed before you sat it."
                      : `${h.questionCount} questions — still open, you can sit it.`}
                </p>
                <div className="row-actions">
                  <Link className="btn secondary compact" href={`/test/${h.id}`}>
                    {h.state === "submitted"
                      ? "See your answers"
                      : h.status === "published"
                        ? "Sit the test"
                        : "Open"}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function scoreLine(h: {
  score: number | null;
  maxScore: number | null;
  submittedAt: Date | null;
}) {
  const pct =
    h.maxScore && h.score !== null
      ? Math.round((h.score / h.maxScore) * 100)
      : null;
  return `${h.score} of ${h.maxScore} correct${pct !== null ? ` · ${pct}%` : ""}${
    h.submittedAt
      ? ` · submitted ${h.submittedAt.toISOString().slice(0, 10)}`
      : ""
  }`;
}

function TestCard({
  href,
  title,
  weekNumber,
  line,
  cta,
}: {
  href: string;
  title: string;
  weekNumber: number;
  line: string;
  cta: string;
}) {
  return (
    <ul className="week-list">
      <li className="week-row is-current">
        <div className="week-head">
          <h3>
            {title}
            <span className="pill pill-ok">week {weekNumber}</span>
          </h3>
        </div>
        <p className="small week-detail">{line}</p>
        <div className="row-actions">
          <Link className="btn primary compact" href={href}>
            {cta}
          </Link>
        </div>
      </li>
    </ul>
  );
}

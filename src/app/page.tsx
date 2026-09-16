import Link from "next/link";
import { settings } from "@/lib/auth";
import { plannedWeekCount } from "@/lib/bank";
import { weekNumberFor } from "@/lib/bank-shared";
import { currentSession } from "@/lib/session";
import { paceTarget } from "@/lib/progress";
import { studentDashboard, type StudentDashboard } from "@/lib/student";

/**
 * A student's home.
 *
 * Ordered by what needs doing rather than by what is most impressive: an open
 * test first, because it is the only thing here with a deadline, then this
 * week's words, then the last test, then the long view. A dashboard that leads
 * with a semester total tells a student how they are doing and not what to do
 * next.
 *
 * Staff land on the class screen instead — this page is about one person's own
 * work, and a teacher who is not also a student has none of it.
 */
export default async function Home() {
  const [me, s] = await Promise.all([currentSession(), settings()]);
  const totalWeeks = await plannedWeekCount();
  const week = weekNumberFor(new Date(), s.termStart, totalWeeks);

  if (!me) return <SignedOut week={week} totalWeeks={totalWeeks} settings={s} />;
  if (!me.isStudent) return <StaffLanding displayName={me.displayName} isAdmin={me.isAdmin} />;

  const d = await studentDashboard(me.userId, week);
  const target = paceTarget(s.vocabGoal, week, totalWeeks);

  return (
    <main className="shell">
      <section className="hero">
        <span className="kicker">
          Week {week} of {totalWeeks}
        </span>
        <h1>안녕하세요, {me.displayName}</h1>
        <p>
          {d.studied} of {s.vocabGoal} words studied against a week-{week}{" "}
          target of {target}
          {d.studied >= target ? " — on pace." : `, so ${target - d.studied} behind.`}{" "}
          {d.verified} verified by test.
        </p>
      </section>

      <div className="section-body">
        <div className="dash-grid">
          <NextUp d={d} week={week} />
          <ThisWeek d={d} />
          <LastTest d={d} />
          <Semester d={d} goal={s.vocabGoal} grammarGoal={s.grammarGoal} target={target} />
        </div>
      </div>
    </main>
  );
}

/** The only card that can be urgent, so it is the only one that ever shouts. */
function NextUp({ d, week }: { d: StudentDashboard; week: number }) {
  const weekLeft = d.week.assigned - d.week.studied;

  return (
    <article className={`dash-card ${d.openTest ? "is-urgent" : ""}`}>
      <div className="dash-head">
        <h2>Next up</h2>
      </div>
      {d.openTest ? (
        <>
          <p className="dash-lead">
            The week {d.openTest.weekNumber} test is open.
          </p>
          <p className="small">
            {d.openTest.questionCount} questions, {d.openTest.timeLimitMinutes}{" "}
            minutes, and the clock runs on the server once you begin.
            {d.openTest.inProgress && " You have one already started."}
          </p>
          <Link className="btn primary" href={`/test/${d.openTest.testId}`}>
            {d.openTest.inProgress ? "Carry on with the test" : "Sit the test"}
          </Link>
        </>
      ) : weekLeft > 0 ? (
        <>
          <p className="dash-lead">
            {weekLeft} of this week&rsquo;s words still to get right.
          </p>
          <p className="small">
            No test is open. Practice is the useful thing to do, and it costs
            nothing to be wrong at.
          </p>
          <Link className="btn primary" href="/vocabulary">
            Practise week {week}
          </Link>
        </>
      ) : (
        <>
          <p className="dash-lead">Nothing waiting.</p>
          <p className="small">
            This week&rsquo;s words are all studied and no test is open. Earlier
            weeks are the ones that fade.
          </p>
          <Link className="btn secondary" href="/vocabulary">
            Review earlier weeks
          </Link>
        </>
      )}
    </article>
  );
}

function ThisWeek({ d }: { d: StudentDashboard }) {
  const pct = d.week.assigned
    ? Math.round((d.week.studied / d.week.assigned) * 100)
    : 0;

  return (
    <article className="dash-card">
      <div className="dash-head">
        <h2>Week {d.week.weekNumber}</h2>
        <span className="small">
          {d.week.studied} of {d.week.assigned}
        </span>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="This week's words studied"
      >
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {/* Per day, because the week is taught in days and "60 of 125" does not
          tell you which evening you skipped. */}
      <ul className="day-strip">
        {d.week.days.map((day) => {
          const share = day.assigned ? day.studied / day.assigned : 0;
          return (
            <li key={day.day} className={share === 1 ? "is-done" : undefined}>
              <span className="day-label">Day {day.day}</span>
              <span className="day-bar">
                <span style={{ width: `${Math.round(share * 100)}%` }} />
              </span>
              <span className="small">
                {day.studied}/{day.assigned}
              </span>
            </li>
          );
        })}
      </ul>
      <Link className="btn secondary compact" href="/vocabulary">
        Open vocabulary
      </Link>
    </article>
  );
}

function LastTest({ d }: { d: StudentDashboard }) {
  if (!d.lastTest) {
    return (
      <article className="dash-card">
        <div className="dash-head">
          <h2>Last test</h2>
        </div>
        <p className="dash-lead">None yet.</p>
        <p className="small">
          Weekly tests are the only thing that counts toward verified. Your
          first one will show up here with what to review.
        </p>
      </article>
    );
  }

  const t = d.lastTest;
  const pct = t.maxScore ? Math.round((t.score / t.maxScore) * 100) : 0;

  return (
    <article className="dash-card">
      <div className="dash-head">
        <h2>Last test</h2>
        <span className="small">Week {t.weekNumber}</span>
      </div>
      <p className="dash-lead">
        {t.score} / {t.maxScore} <span className="dash-pct">{pct}%</span>
      </p>
      {t.missed.length > 0 ? (
        <>
          <p className="small">Worth another look:</p>
          <ul className="missed-list">
            {t.missed.slice(0, 5).map((m) => (
              <li key={m.korean}>
                <span lang="ko">{m.korean}</span>
                <span className="small">{m.english}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="small">Nothing wrong on it.</p>
      )}
      <Link className="btn secondary compact" href={`/test/${t.testId}`}>
        See every answer
      </Link>
    </article>
  );
}

function Semester({
  d,
  goal,
  grammarGoal,
  target,
}: {
  d: StudentDashboard;
  goal: number;
  grammarGoal: number;
  target: number;
}) {
  const pct = Math.min(100, Math.round((d.studied / goal) * 100));
  const targetPct = Math.min(100, Math.round((target / goal) * 100));

  return (
    <article className="dash-card is-term">
      <div className="dash-head">
        <h2>The term</h2>
        <span className="small">{pct}% of {goal}</span>
      </div>
      <div className="pace-track" aria-hidden="true">
        <div
          className={`pace-fill ${d.studied >= target ? "" : "pace-fill-behind"}`}
          style={{ width: `${pct}%` }}
        />
        <div className="pace-target" style={{ left: `${targetPct}%` }} />
      </div>
      <p className="small pace-caption">
        {d.studied} studied · marker is this week&rsquo;s target of {target}
      </p>
      <dl className="dash-figures">
        <div>
          <dt>Verified by test</dt>
          <dd>{d.verified}</dd>
        </div>
        <div>
          <dt>Grammar studied</dt>
          <dd>
            {d.grammarStudied}/{grammarGoal}
          </dd>
        </div>
        <div>
          <dt>Practice runs</dt>
          <dd>{d.practiceRuns}</dd>
        </div>
      </dl>
      <p className="small">
        <strong>Studied</strong> is getting a word right first time in practice.{" "}
        <strong>Verified</strong> is getting it right on two separate tests —
        much harder, and much smaller.
      </p>
    </article>
  );
}

function StaffLanding({
  displayName,
  isAdmin,
}: {
  displayName: string;
  isAdmin: boolean;
}) {
  return (
    <main className="shell">
      <section className="hero">
        <span className="kicker">{displayName}</span>
        <h1>한국어</h1>
        <p>
          This page is a student&rsquo;s own progress. Yours is the class.
        </p>
      </section>
      <div className="section-body">
        <div className="answer-form">
          <Link className="btn primary" href="/teacher/home">
            Class progress
          </Link>
          <Link className="btn secondary" href="/teacher/tests">
            Weekly tests
          </Link>
          {isAdmin && (
            <Link className="btn secondary" href="/admin">
              All accounts
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

function SignedOut({
  week,
  totalWeeks,
  settings: s,
}: {
  week: number;
  totalWeeks: number;
  settings: { vocabPerWeek: number; grammarPerWeek: number; studyDaysPerWeek: number; vocabGoal: number; grammarGoal: number; termStart: string; termEnd: string };
}) {
  return (
    <main className="shell">
      <section className="hero">
        <span className="kicker">
          Week {week} of {totalWeeks} · {s.termStart} to {s.termEnd}
        </span>
        <h1>한국어</h1>
        <p>
          {s.vocabPerWeek} new words and {s.grammarPerWeek} grammar points each
          week, split across {s.studyDaysPerWeek} study days, building to{" "}
          {s.vocabGoal} words and {s.grammarGoal} patterns by the end of term.
        </p>
      </section>
      <div className="section-body">
        <Link className="btn primary" href="/login">
          Sign in
        </Link>
      </div>
    </main>
  );
}

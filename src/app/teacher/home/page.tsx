import Link from "next/link";
import { currentTeacher, settings } from "@/lib/auth";
import { plannedWeekCount } from "@/lib/bank";
import { weekNumberFor } from "@/lib/bank-shared";
import { cohortProgress, paceTarget, type StudentProgress } from "@/lib/progress";

export const metadata = { title: "Teacher · hangukeo" };

export default async function TeacherHome() {
  const [me, s] = await Promise.all([currentTeacher(), settings()]);
  const totalWeeks = await plannedWeekCount();
  const week = weekNumberFor(new Date(), s.termStart, totalWeeks);
  const students = await cohortProgress();

  // Pace is measured against studied, the number that tracks the 1,500 goal.
  const target = paceTarget(s.vocabGoal, week, totalWeeks);
  const behind = students.filter((p) => p.vocabStudied < target).length;
  const avgStudied = students.length
    ? Math.round(students.reduce((n, p) => n + p.vocabStudied, 0) / students.length)
    : 0;
  const avgVerified = students.length
    ? Math.round(students.reduce((n, p) => n + p.vocabVerified, 0) / students.length)
    : 0;

  return (
    <main className="shell">
      <section className="hero">
        <span className="kicker">
          Week {week} of {totalWeeks} · {me.displayName}
        </span>
        <h1>Class progress</h1>
        <p>
          {students.length} students averaging {avgStudied} words studied
          against a week-{week} target of {target}, and {avgVerified} verified
          by test. {behind} behind pace.
        </p>
      </section>

      <div className="section-body">
        <div className="legend">
          <p>
            <strong>Studied</strong> — got it right first time in practice at
            least once. Self-directed, and what the {s.vocabGoal}-word goal is
            measured against.
          </p>
          <p>
            <strong>Verified</strong> — correct on two separate tests with the
            most recent answer correct. Proctored, so much smaller: a weekly
            test samples about 20 of the {s.vocabPerWeek} words assigned.
          </p>
          <p>
            <strong>Retention</strong> — accuracy on words that appeared on an
            earlier test. The number that separates learning from cramming.
          </p>
        </div>

        <div className="teacher-toolbar">
          <span className="small">Click a student for their detail.</span>
          <Link className="btn secondary" href="/teacher/people">
            People &amp; invites
          </Link>
        </div>

        <div className="student-grid">
          {students.map((p) => (
            <StudentCard
              key={p.id}
              p={p}
              target={target}
              goal={s.vocabGoal}
              grammarGoal={s.grammarGoal}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

function StudentCard({
  p,
  target,
  goal,
  grammarGoal,
}: {
  p: StudentProgress;
  target: number;
  goal: number;
  grammarGoal: number;
}) {
  const onPace = p.vocabStudied >= target;
  const studiedPct = Math.min(100, Math.round((p.vocabStudied / goal) * 100));
  const verifiedPct = Math.min(100, Math.round((p.vocabVerified / goal) * 100));
  const targetPct = Math.min(100, Math.round((target / goal) * 100));

  return (
    <Link href={`/teacher/students/${p.id}`} className="student-card">
      <div className="student-card-head">
        <h3>{p.displayName}</h3>
        <span className={`pill ${onPace ? "pill-ok" : "pill-behind"}`}>
          {onPace ? "On pace" : "Behind"}
        </span>
      </div>

      <p className="small student-card-team">
        {p.teamName ?? "No team"}
        {p.taName ? ` · TA ${p.taName}` : ""}
      </p>

      <div className="mini-stats">
        <div>
          <span className="mini-value">{p.vocabStudied}</span>
          <span className="mini-label">studied</span>
        </div>
        <div>
          <span className="mini-value">{p.vocabVerified}</span>
          <span className="mini-label">verified</span>
        </div>
        <div>
          <span className="mini-value">
            {p.grammarStudied}
            <span className="mini-sub">/{grammarGoal}</span>
          </span>
          <span className="mini-label">grammar</span>
        </div>
        <div>
          <span
            className={`mini-value ${
              p.retentionRate !== null && p.retentionRate < 60 ? "mini-warn" : ""
            }`}
          >
            {p.retentionRate !== null ? `${p.retentionRate}%` : "—"}
          </span>
          <span className="mini-label">retention</span>
        </div>
      </div>

      {/*
        One track, two fills: the pale band is studied, the solid band inside it
        is the test-verified subset, and the notch is this week's target.
      */}
      <div
        className="pace-track"
        role="img"
        aria-label={`${p.vocabStudied} of ${goal} words studied, ${p.vocabVerified} verified, target ${target}`}
      >
        <div
          className={`pace-fill ${onPace ? "" : "pace-fill-behind"}`}
          style={{ width: `${studiedPct}%` }}
        />
        <div className="pace-verified" style={{ width: `${verifiedPct}%` }} />
        <div className="pace-target" style={{ left: `${targetPct}%` }} />
      </div>
      <p className="small pace-caption">
        {p.vocabStudied} studied · {p.vocabVerified} verified · target {target}
      </p>
      <p className="small pace-caption">
        {p.practiceRuns} practice run{p.practiceRuns === 1 ? "" : "s"} ·{" "}
        {p.testsTaken} test{p.testsTaken === 1 ? "" : "s"}
        {p.lastScore !== null && p.lastMaxScore
          ? ` · last ${Math.round((p.lastScore / p.lastMaxScore) * 100)}%`
          : ""}
      </p>
    </Link>
  );
}

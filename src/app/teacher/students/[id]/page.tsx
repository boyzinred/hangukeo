import Link from "next/link";
import { notFound } from "next/navigation";
import { settings } from "@/lib/auth";
import { requireStaff } from "@/lib/session";
import { plannedWeekCount } from "@/lib/bank";
import { POS_LABELS, weekNumberFor } from "@/lib/bank-shared";
import { cohortProgress, paceTarget, studentDetail } from "@/lib/progress";

export default async function StudentDetail({
  params,
}: PageProps<"/teacher/students/[id]">) {
  await requireStaff();
  const { id } = await params;
  const detail = await studentDetail(id);
  if (!detail) notFound();

  const { student, history, missed, byPos, grammarResults } = detail;
  const s = await settings();
  const totalWeeks = await plannedWeekCount();
  const week = weekNumberFor(new Date(), s.termStart, totalWeeks);
  const target = paceTarget(s.vocabGoal, week, totalWeeks);

  const cohort = await cohortProgress();
  const me = cohort.find((c) => c.id === id);
  const onPace = (me?.vocabStudied ?? 0) >= target;

  return (
    <main className="shell">
      <section className="hero">
        <span className="kicker">
          {student.teamName ?? "No team"}
          {student.taName ? ` · TA ${student.taName}` : ""}
        </span>
        <h1>{student.displayName}</h1>
        <p>
          {me?.vocabStudied ?? 0} of {s.vocabGoal} words studied against a
          week-{week} target of {target} — {onPace ? "on pace" : "behind pace"}.
          Of those, {me?.vocabVerified ?? 0} are verified by test, from{" "}
          {me?.vocabSeen ?? 0} distinct words tested so far.
        </p>
      </section>

      <div className="section-body">
        <div className="teacher-toolbar">
          <span className="small">{student.email}</span>
          <Link className="btn secondary" href="/teacher/home">
            Back to class
          </Link>
        </div>

        <div className="stat-row">
          <Stat
            label="Words studied"
            value={`${me?.vocabStudied ?? 0}/${s.vocabGoal}`}
          />
          <Stat label="Verified by test" value={`${me?.vocabVerified ?? 0}`} />
          <Stat
            label="Grammar studied"
            value={`${me?.grammarStudied ?? 0}/${s.grammarGoal}`}
          />
          <Stat
            label="Retention"
            value={
              me?.retentionRate !== null && me?.retentionRate !== undefined
                ? `${me.retentionRate}%`
                : "—"
            }
            warn={me?.retentionRate !== null && (me?.retentionRate ?? 100) < 60}
          />
        </div>
        <p className="small legend-note">
          {me?.practiceRuns ?? 0} practice run
          {me?.practiceRuns === 1 ? "" : "s"} · {me?.testsTaken ?? 0} test
          {me?.testsTaken === 1 ? "" : "s"} · studied means first-try correct in
          practice; verified means correct on two separate tests.
        </p>

        <h2 className="section-heading">Test history</h2>
        {history.length === 0 ? (
          <p className="small">No tests taken yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="roster">
              <thead>
                <tr>
                  <th>Week</th>
                  <th>Test</th>
                  <th>Score</th>
                  <th>Percent</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.testId}>
                    <td>{h.weekNumber}</td>
                    <td>{h.title}</td>
                    <td>
                      {h.score ?? "—"} / {h.maxScore ?? "—"}
                    </td>
                    <td>
                      {h.score !== null && h.maxScore
                        ? `${Math.round((h.score / h.maxScore) * 100)}%`
                        : "—"}
                    </td>
                    <td className="small">
                      {h.submittedAt
                        ? h.submittedAt.toISOString().slice(0, 10)
                        : "not submitted"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2 className="section-heading">Accuracy by part of speech</h2>
        {byPos.length === 0 ? (
          <p className="small">Nothing tested yet.</p>
        ) : (
          <ul className="pos-bars">
            {byPos.map((p) => {
              const pct = Math.round((p.correct / p.asked) * 100);
              const label = p.partOfSpeech
                ? (POS_LABELS[p.partOfSpeech]?.label ?? p.partOfSpeech)
                : "Untagged";
              return (
                <li key={p.partOfSpeech ?? "none"}>
                  <span className="pos-bar-label">{label}</span>
                  <div className="pos-bar-track">
                    <div
                      className={`pos-bar-fill ${pct < 60 ? "pos-bar-warn" : ""}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="small pos-bar-value">
                    {pct}% · {p.correct}/{p.asked}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <h2 className="section-heading">Grammar</h2>
        {grammarResults.length === 0 ? (
          <p className="small">No grammar tested yet.</p>
        ) : (
          <ul className="review-list">
            {grammarResults.map((g) => (
              <li key={g.form}>
                <strong>{g.form}</strong>
                <span>{g.name}</span>
                <span className="small">
                  {g.correct}/{g.asked} correct
                </span>
              </li>
            ))}
          </ul>
        )}

        <h2 className="section-heading">Words to review</h2>
        {missed.length === 0 ? (
          <p className="small">Nothing missed — every tested word is correct.</p>
        ) : (
          <ul className="review-list">
            {missed.map((m) => (
              <li key={m.vocabId}>
                <strong lang="ko">{m.korean}</strong>
                <span>{m.english}</span>
                <span className="small">
                  {m.timesCorrect}/{m.timesSeen} correct
                  {m.partOfSpeech ? ` · ${m.partOfSpeech}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="stat">
      <span className={`stat-value ${warn ? "mini-warn" : ""}`}>{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

import Link from "next/link";
import { settings } from "@/lib/auth";
import { plannedWeekCount } from "@/lib/bank";
import { weekNumberFor } from "@/lib/bank-shared";

export default async function Home() {
  const s = await settings();
  const totalWeeks = await plannedWeekCount();
  const week = weekNumberFor(new Date(), s.termStart, totalWeeks);

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
        <div className="answer-form">
          <Link className="btn primary" href="/bank">
            Open your bank
          </Link>
          <Link className="btn positive" href="/practice">
            Practice now
          </Link>
        </div>
      </div>
    </main>
  );
}

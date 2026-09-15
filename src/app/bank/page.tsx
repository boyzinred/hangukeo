import { currentUser, settings, teamOf } from "@/lib/auth";
import { bankGrammar, bankWords, plannedWeekCount } from "@/lib/bank";
import { weekNumberFor } from "@/lib/bank-shared";
import { BankView } from "./bank-view";

export const metadata = { title: "Bank · hangukeo" };

export default async function BankPage() {
  const [me, s] = await Promise.all([currentUser(), settings()]);
  const totalWeeks = await plannedWeekCount();
  const week = weekNumberFor(new Date(), s.termStart, totalWeeks);

  const [words, grammar, team] = await Promise.all([
    bankWords(week),
    bankGrammar(week),
    teamOf(me.userId),
  ]);

  return (
    <main className="shell">
      <section className="hero">
        <span className="kicker">
          Week {week} of {totalWeeks}
          {team ? ` · ${team.teamName}` : ""}
        </span>
        <h1>{me.displayName}&rsquo;s bank</h1>
        <p>
          {words.length} words and {grammar.length} grammar points assigned so
          far, against a semester goal of {s.vocabGoal} words and{" "}
          {s.grammarGoal} patterns. Each week adds {s.vocabPerWeek} words split
          across {s.studyDaysPerWeek} study days, and {s.grammarPerWeek} grammar
          points.
        </p>
      </section>

      <div className="section-body">
        <BankView
          words={words}
          grammar={grammar}
          currentWeek={week}
        />
      </div>
    </main>
  );
}

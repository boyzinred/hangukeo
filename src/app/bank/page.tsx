import { settings, teamOf } from "@/lib/auth";
import { requireStudent } from "@/lib/session";
import { bankGrammar, bankWords, plannedWeekCount } from "@/lib/bank";
import { weekNumberFor } from "@/lib/bank-shared";
import { studiedIds } from "@/lib/student";
import { BankView } from "./bank-view";

export const metadata = { title: "Bank · hangukeo" };

/**
 * Everything assigned so far, and the drill over it, on one page.
 *
 * Browsing and practising used to be two routes, which meant choosing what to
 * work on in one place and doing it in another, with the selection lost in
 * between. They are the same activity: you look at a day's words, then you
 * drill that day.
 */
export default async function BankPage() {
  const [me, s] = await Promise.all([requireStudent(), settings()]);
  const totalWeeks = await plannedWeekCount();
  const week = weekNumberFor(new Date(), s.termStart, totalWeeks);

  const [words, grammar, team, studied] = await Promise.all([
    bankWords(week),
    bankGrammar(week),
    teamOf(me.userId),
    studiedIds(me.userId),
  ]);

  return (
    <main className="shell">
      <section className="hero">
        <span className="kicker">
          Week {week} of {totalWeeks}
          {team ? ` · ${team.teamName}` : ""}
        </span>
        <h1>Vocabulary and grammar</h1>
        <p>
          Every word and pattern assigned so far. Practise a study day, a part
          of speech, a week of grammar, or the lot — nothing here is recorded
          toward your semester total, so it is the safe place to be wrong.
        </p>
      </section>

      <div className="section-body">
        <BankView
          words={words}
          grammar={grammar}
          currentWeek={week}
          studiedWords={[...studied.vocab]}
          studiedGrammar={[...studied.grammar]}
          goal={s.vocabGoal}
        />
      </div>
    </main>
  );
}

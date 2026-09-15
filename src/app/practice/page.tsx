import { settings } from "@/lib/auth";
import { bankGrammar, bankWords, plannedWeekCount } from "@/lib/bank";
import { weekNumberFor } from "@/lib/bank-shared";
import type { QuizWord } from "@/lib/quiz";
import { PracticeRunner } from "./practice-runner";

export const metadata = { title: "Practice · hangukeo" };

/**
 * Scope comes in on the query string so the bank can deep-link a selection:
 *   /practice?kind=words&days=1:2,1:3   (week:day pairs)
 *   /practice?kind=words&week=3
 *   /practice?kind=grammar
 */
export default async function PracticePage({
  searchParams,
}: PageProps<"/practice">) {
  const sp = await searchParams;
  const kind = sp.kind === "grammar" ? "grammar" : "words";
  const s = await settings();
  const totalWeeks = await plannedWeekCount();
  const thisWeek = weekNumberFor(new Date(), s.termStart, totalWeeks);

  const daysParam = typeof sp.days === "string" ? sp.days : "";
  const weekParam = typeof sp.week === "string" ? Number(sp.week) : null;
  const pickedDays = new Set(daysParam.split(",").filter(Boolean));

  let pool: QuizWord[];
  let scopeLabel: string;

  if (kind === "grammar") {
    const grammar = await bankGrammar(thisWeek);
    // The drill reuses the vocabulary engine: the pattern is the "Korean" side
    // and its name the "English" side, with the full meaning also accepted.
    pool = grammar.map((g) => ({
      id: g.id,
      korean: g.form,
      english: g.name,
      acceptedAnswers: [g.name, g.meaning],
    }));
    scopeLabel = `${grammar.length} grammar patterns through week ${thisWeek}`;
  } else {
    const all = await bankWords(thisWeek);
    const selected = pickedDays.size
      ? all.filter((w) => pickedDays.has(`${w.weekNumber}:${w.studyDay}`))
      : weekParam
        ? all.filter((w) => w.weekNumber === weekParam)
        : all;
    pool = selected.map((w) => ({
      id: w.id,
      korean: w.korean,
      english: w.english,
      acceptedAnswers: w.acceptedAnswers,
    }));
    scopeLabel = pickedDays.size
      ? `${pool.length} words from ${pickedDays.size} study ${pickedDays.size === 1 ? "day" : "days"}`
      : weekParam
        ? `${pool.length} words from week ${weekParam}`
        : `${pool.length} words in your bank`;
  }

  return (
    <main className="shell">
      <section className="hero">
        <span className="kicker">Practice</span>
        <h1>{kind === "grammar" ? "Grammar drill" : "Translation drill"}</h1>
        <p>
          {scopeLabel}. Answers ignore spacing, and a word you miss comes back
          once before it counts against you. Practice is not recorded toward
          your semester total — only weekly tests count.
        </p>
      </section>

      <div className="section-body">
        {pool.length === 0 ? (
          <p>Nothing assigned in this scope yet.</p>
        ) : (
          <PracticeRunner pool={pool} kind={kind} />
        )}
      </div>
    </main>
  );
}

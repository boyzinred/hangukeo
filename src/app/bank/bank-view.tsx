"use client";

import { useMemo, useState } from "react";
import {
  groupByPos,
  groupByWeekDay,
  type BankGrammar,
  type BankWord,
} from "@/lib/bank-shared";
import type { QuizWord } from "@/lib/quiz";
import { Exercise, type PickerOption } from "./exercise";

type GroupBy = "day" | "pos";
type Tab = "words" | "grammar";
/** Which column a section is hiding, for self-testing in place. */
type Cover = "none" | "english" | "korean";
type Sort = "korean" | "english" | "todo";

const SORT_LABELS: Record<Sort, string> = {
  korean: "Korean A–Z",
  english: "English A–Z",
  todo: "Not studied first",
};

type Section = {
  key: string;
  title: string;
  subtitle?: string;
  words: BankWord[];
};

export function BankView({
  words,
  grammar,
  currentWeek,
  studiedWords,
  studiedGrammar,
  goal,
}: {
  words: BankWord[];
  grammar: BankGrammar[];
  currentWeek: number;
  studiedWords: string[];
  studiedGrammar: string[];
  goal: number;
}) {
  const [tab, setTab] = useState<Tab>("words");
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const [query, setQuery] = useState("");
  // This week's days, ticked. The exercise below reads the same set, so a
  // student who came to practise tonight's batch can press Start without
  // choosing anything first.
  const [picked, setPicked] = useState<Set<string>>(
    () =>
      new Set(
        words
          .filter((w) => w.weekNumber === currentWeek)
          .map((w) => `${w.weekNumber}:${w.studyDay}`),
      ),
  );
  const [open, setOpen] = useState<Set<string>>(
    () =>
      new Set(
        words
          .filter((w) => w.weekNumber === currentWeek)
          .map((w) => `${w.weekNumber}:${w.studyDay}`),
      ),
  );
  // Cover and sort are per section: a student covering the English on day 3 is
  // testing day 3, and having that follow them into every other section was
  // the thing most likely to be switched straight back off.
  const [cover, setCover] = useState<Record<string, Cover>>({});
  const [sort, setSort] = useState<Record<string, Sort>>({});
  // Grammar keeps its own selection. Weeks are the only grouping it has, so
  // there is no group-by control and nothing to keep the two tabs in step
  // about — mixing their picks would just mean one Start button running the
  // wrong pool.
  const [pickedGrammar, setPickedGrammar] = useState<Set<string>>(
    () => new Set([String(currentWeek)]),
  );
  const [openGrammar, setOpenGrammar] = useState<Set<string>>(
    () => new Set([String(currentWeek)]),
  );

  // Intersected with the bank on purpose. A student may have practised words
  // from a week not yet assigned, and counting those here would put a bigger
  // number on this page than the dashboard shows for the same thing.
  const studied = useMemo(() => {
    const practised = new Set(studiedWords);
    return new Set(words.filter((w) => practised.has(w.id)).map((w) => w.id));
  }, [studiedWords, words]);

  const studiedG = useMemo(() => {
    const practised = new Set(studiedGrammar);
    return new Set(grammar.filter((g) => practised.has(g.id)).map((g) => g.id));
  }, [studiedGrammar, grammar]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return words;
    return words.filter(
      (w) =>
        w.korean.includes(q) ||
        w.english.toLowerCase().includes(q) ||
        w.acceptedAnswers.some((a) => a.toLowerCase().includes(q)),
    );
  }, [words, query]);

  const sections: Section[] = useMemo(() => {
    if (groupBy === "day") {
      return groupByWeekDay(filtered).map((g) => ({
        key: g.key,
        title: `Week ${g.week} · Day ${g.day}`,
        words: g.words,
      }));
    }
    return groupByPos(filtered).map((g) => ({
      key: g.key,
      title: g.label,
      subtitle: g.korean,
      words: g.words,
    }));
  }, [filtered, groupBy]);

  /** The same keys the exercise picker uses, so a tick here is a tick there. */
  const pickerOptions: PickerOption[] = useMemo(() => {
    if (groupBy === "day") {
      return groupByWeekDay(words).map((g) => ({
        key: g.key,
        label: `Week ${g.week} · Day ${g.day}`,
        count: g.words.length,
      }));
    }
    return groupByPos(words).map((g) => ({
      key: g.key,
      label: g.label,
      count: g.words.length,
    }));
  }, [words, groupBy]);

  /** Grammar has one useful grouping: the week it was taught. */
  const grammarWeeks = useMemo(() => {
    const map = new Map<number, BankGrammar[]>();
    for (const g of grammar) {
      if (!map.has(g.weekNumber)) map.set(g.weekNumber, []);
      map.get(g.weekNumber)!.push(g);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([week, items]) => ({ week, key: String(week), items }));
  }, [grammar]);

  const grammarOptions: PickerOption[] = useMemo(
    () =>
      grammarWeeks.map((g) => ({
        key: g.key,
        label: `Week ${g.week}`,
        count: g.items.length,
      })),
    [grammarWeeks],
  );

  /**
   * Sentences for the chosen weeks, one question each.
   *
   * Practising a pattern means producing it, not naming it: a student who can
   * say "-지만 means but" and cannot build a sentence with it has learned a
   * label. Each example the corpus carries becomes an English sentence to put
   * back into Korean, and the run is recorded against the pattern rather than
   * the sentence, so a week of drilling moves the pattern's studied mark.
   */
  const grammarFor = useMemo(() => {
    return (keys: Set<string>): QuizWord[] =>
      grammar
        .filter((g) => keys.has(String(g.weekNumber)))
        .flatMap((g) =>
          g.examples.map((e, i) => ({
            id: `${g.id}#${i}`,
            korean: e.ko,
            english: e.en,
            acceptedAnswers: [e.ko],
          })),
        );
  }, [grammar]);

  /** "g1-g17#2" is a sentence; the thing practised is "g1-g17". */
  const grammarOutcomeId = useMemo(
    () => (item: QuizWord) => item.id.split("#")[0],
    [],
  );

  const wordsIn = useMemo(() => {
    return (keys: Set<string>): BankWord[] => {
      if (keys.size === 0) return [];
      if (groupBy === "day") {
        return words.filter((w) => keys.has(`${w.weekNumber}:${w.studyDay}`));
      }
      return words.filter((w) => keys.has(w.partOfSpeech ?? "noun"));
    };
  }, [words, groupBy]);

  const wordsFor = useMemo(
    () => (keys: Set<string>): QuizWord[] =>
      wordsIn(keys).map((w) => ({
        id: w.id,
        korean: w.korean,
        english: w.english,
        acceptedAnswers: w.acceptedAnswers,
      })),
    [wordsIn],
  );

  function toggleIn<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  function sortWords(list: BankWord[], how: Sort): BankWord[] {
    const out = [...list];
    if (how === "english") {
      out.sort((a, b) => a.english.localeCompare(b.english));
    } else if (how === "todo") {
      out.sort(
        (a, b) =>
          Number(studied.has(a.id)) - Number(studied.has(b.id)) ||
          a.korean.localeCompare(b.korean, "ko"),
      );
    } else {
      out.sort((a, b) => a.korean.localeCompare(b.korean, "ko"));
    }
    return out;
  }

  const thisWeekWords = words.filter((w) => w.weekNumber === currentWeek);
  const studiedThisWeek = thisWeekWords.filter((w) => studied.has(w.id)).length;
  const pickedCount = wordsIn(picked).length;
  const pickedGrammarCount = grammarFor(pickedGrammar).length;
  const pickedGrammarPatterns = grammar.filter((g) =>
    pickedGrammar.has(String(g.weekNumber)),
  ).length;

  return (
    <>
      <div className="stat-strip">
        <Stat label="Words assigned" value={words.length} note={`of ${goal} by term end`} />
        <Stat label="Studied" value={studied.size} note="right first time in practice" />
        <Stat
          label={`Week ${currentWeek}`}
          value={`${studiedThisWeek}/${thisWeekWords.length}`}
          note="this week's words studied"
        />
        <Stat
          label="Grammar"
          value={`${studiedG.size}/${grammar.length}`}
          note="patterns studied"
        />
      </div>

      {/* Two halves of one bank, so they read as two doors rather than as a
          filter someone might not notice they had set. */}
      <div className="bank-tabs" role="tablist" aria-label="Bank">
        <button
          type="button"
          role="tab"
          className={`bank-tab ${tab === "words" ? "active" : ""}`}
          aria-selected={tab === "words"}
          onClick={() => setTab("words")}
        >
          <span className="bank-tab-name">Words</span>
          <span className="bank-tab-count">{words.length}</span>
          <span className="bank-tab-note small">
            {studied.size} studied · drill by day or part of speech
          </span>
        </button>
        <button
          type="button"
          role="tab"
          className={`bank-tab ${tab === "grammar" ? "active" : ""}`}
          aria-selected={tab === "grammar"}
          onClick={() => setTab("grammar")}
        >
          <span className="bank-tab-name">Grammar</span>
          <span className="bank-tab-count">{grammar.length}</span>
          <span className="bank-tab-note small">
            {studiedG.size} studied · translate sentences with each pattern
          </span>
        </button>
      </div>

      {tab === "grammar" ? (
        <>
          <div className="practice-cta">
            <div>
              <h2>Practise grammar</h2>
              <p className="small">
                {pickedGrammar.size > 0
                  ? `${pickedGrammarCount} sentence${pickedGrammarCount === 1 ? "" : "s"} across ${pickedGrammarPatterns} pattern${pickedGrammarPatterns === 1 ? "" : "s"}. Set it up below.`
                  : "Tick the weeks you want, then set up a run below."}
              </p>
            </div>
            <a className="btn primary" href="#exercise">
              {pickedGrammar.size > 0
                ? `Translate ${pickedGrammarCount} sentences`
                : "Set up practice"}
            </a>
          </div>

          {grammarWeeks.map((gw) => {
            const isOpen = openGrammar.has(gw.key);
            const done = gw.items.filter((g) => studiedG.has(g.id)).length;
            return (
              <section key={gw.key} className="vocab-section">
                <div className="vocab-section-head">
                  <label className="check vocab-pick">
                    <input
                      type="checkbox"
                      checked={pickedGrammar.has(gw.key)}
                      onChange={() => setPickedGrammar((p) => toggleIn(p, gw.key))}
                      aria-label={`Select week ${gw.week} grammar for practice`}
                    />
                    <span />
                  </label>
                  <button
                    type="button"
                    className="vocab-section-toggle"
                    aria-expanded={isOpen}
                    onClick={() => setOpenGrammar((o) => toggleIn(o, gw.key))}
                  >
                    <h3>Week {gw.week}</h3>
                    <span className="small">
                      {done}/{gw.items.length} studied
                    </span>
                    <span className="vocab-chevron" aria-hidden="true">
                      {isOpen ? "\u2212" : "+"}
                    </span>
                  </button>
                </div>

                {isOpen && (
                  <div className="grammar-list">
                    {gw.items.map((g) => (
                      <article key={g.id} className="grammar-card">
                        <div className="grammar-head">
                          <h3 lang="ko">{g.form}</h3>
                          <span className="small">
                            {g.name}
                            {studiedG.has(g.id) && (
                              <span className="pill pill-ok studied-pill">studied</span>
                            )}
                          </span>
                        </div>
                        <p>{g.meaning}</p>
                        {g.shape && <p className="small">{g.shape}</p>}
                        {g.examples.length > 0 && (
                          <ul className="example-list">
                            {g.examples.slice(0, 3).map((e, i) => (
                              <li key={i}>
                                <span lang="ko">{e.ko}</span>
                                <span className="small">{e.en}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          })}

          <Exercise
            kicker="Practice"
            title="Translate with the pattern"
            blurb="An English sentence, and you write the Korean using the pattern it was taught with. Grammar has one grouping worth having — the week it was taught — so the weeks are the whole choice. Spacing and punctuation are ignored."
            options={grammarOptions}
            selected={pickedGrammar}
            onSelectedChange={setPickedGrammar}
            itemsFor={grammarFor}
            kind="grammar"
            koreanLabel="Korean"
            englishLabel="English"
            unit="sentence"
            asSentences
            outcomeId={grammarOutcomeId}
            emptyNote="No sentences in those weeks yet."
          />
        </>
      ) : (
        <>
          <div className="vocab-toolbar">
            <div className="mode-row">
              <span className="mode-label">Group by</span>
              <button
                type="button"
                className={`mode-btn ${groupBy === "day" ? "active" : ""}`}
                aria-pressed={groupBy === "day"}
                onClick={() => {
                  setGroupBy("day");
                  setPicked(new Set());
                }}
              >
                Study day
              </button>
              <button
                type="button"
                className={`mode-btn ${groupBy === "pos" ? "active" : ""}`}
                aria-pressed={groupBy === "pos"}
                onClick={() => {
                  setGroupBy("pos");
                  setPicked(new Set());
                }}
              >
                Part of speech
              </button>
            </div>

            <input
              className="answer-input vocab-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Korean or English…"
              aria-label="Search the vocabulary"
            />

            <div className="row-actions">
              <button
                type="button"
                className="btn secondary compact"
                onClick={() => setOpen(new Set(sections.map((s) => s.key)))}
              >
                Open all
              </button>
              <button
                type="button"
                className="btn secondary compact"
                onClick={() => setOpen(new Set())}
              >
                Close all
              </button>
            </div>
          </div>

          <nav className="jump-card" aria-label="Jump to a section">
            <span className="mode-label">Jump to</span>
            <div className="jump-grid">
              {sections.map((s) => (
                <a key={s.key} className="jump-link" href={`#sec-${sectionId(s.key)}`}>
                  {s.title} <span className="small">{s.words.length}</span>
                </a>
              ))}
            </div>
          </nav>

          <div className="practice-cta">
            <div>
              <h2>Practise</h2>
              <p className="small">
                {picked.size > 0
                  ? `${pickedCount} words ticked from ${picked.size} section${picked.size === 1 ? "" : "s"}. Set it up below.`
                  : "Tick the sections you want, then set up a run below — language, word limit, timer."}
              </p>
            </div>
            <a className="btn primary" href="#exercise">
              {picked.size > 0 ? `Practise ${pickedCount} words` : "Set up practice"}
            </a>
          </div>

          {sections.length === 0 && (
            <p className="small">Nothing matches &ldquo;{query}&rdquo;.</p>
          )}

          {sections.map((s) => {
            const isOpen = open.has(s.key) || query.trim().length > 0;
            const done = s.words.filter((w) => studied.has(w.id)).length;
            const sectionCover = cover[s.key] ?? "none";
            const sectionSort = sort[s.key] ?? "korean";

            return (
              <section key={s.key} id={`sec-${sectionId(s.key)}`} className="vocab-section">
                <div className="vocab-section-head">
                  <label className="check vocab-pick">
                    <input
                      type="checkbox"
                      checked={picked.has(s.key)}
                      onChange={() => setPicked((p) => toggleIn(p, s.key))}
                      aria-label={`Select ${s.title} for practice`}
                    />
                    <span />
                  </label>
                  <button
                    type="button"
                    className="vocab-section-toggle"
                    aria-expanded={isOpen}
                    onClick={() => setOpen((o) => toggleIn(o, s.key))}
                  >
                    <h3>
                      {s.title}
                      {s.subtitle && <span className="pos-korean">{s.subtitle}</span>}
                    </h3>
                    <span className="small">
                      {done}/{s.words.length} studied
                    </span>
                    <span className="vocab-chevron" aria-hidden="true">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                </div>

                {isOpen && (
                  <>
                    <div className="section-controls">
                      <span className="mode-label">Cover</span>
                      {(["english", "korean"] as const).map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`mode-btn ${sectionCover === c ? "active" : ""}`}
                          aria-pressed={sectionCover === c}
                          onClick={() =>
                            setCover((prev) => ({
                              ...prev,
                              [s.key]: prev[s.key] === c ? "none" : c,
                            }))
                          }
                        >
                          {c === "english" ? "English" : "Korean"}
                        </button>
                      ))}

                      <span className="mode-label">Sort by</span>
                      <select
                        className="compact-select"
                        value={sectionSort}
                        onChange={(e) =>
                          setSort((prev) => ({ ...prev, [s.key]: e.target.value as Sort }))
                        }
                        aria-label={`Sort ${s.title}`}
                      >
                        {(Object.keys(SORT_LABELS) as Sort[]).map((k) => (
                          <option key={k} value={k}>
                            {SORT_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="table-wrap">
                      <table className="vocab-table">
                        <thead>
                          <tr>
                            <th>Korean</th>
                            <th>English</th>
                            <th>{groupBy === "day" ? "Part of speech" : "Day"}</th>
                            <th className="col-studied">Studied</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortWords(s.words, sectionSort).map((w) => (
                            <tr key={w.id}>
                              <td>
                                <span
                                  lang="ko"
                                  className={`hangul ${sectionCover === "korean" ? "covered" : ""}`}
                                >
                                  {w.korean}
                                </span>
                              </td>
                              <td>
                                <span
                                  className={sectionCover === "english" ? "covered" : ""}
                                >
                                  {w.english}
                                </span>
                              </td>
                              <td className="small">
                                {groupBy === "day"
                                  ? (w.partOfSpeech ?? "—")
                                  : `W${w.weekNumber} D${w.studyDay}`}
                              </td>
                              <td className="col-studied">
                                {studied.has(w.id) ? (
                                  <span
                                    className="studied-mark"
                                    title="Right first time in practice"
                                  >
                                    ✓
                                  </span>
                                ) : (
                                  <span className="studied-mark is-blank" aria-hidden="true">
                                    ·
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            );
          })}

          <Exercise
            kicker="Practice"
            title={groupBy === "day" ? "By study day" : "By part of speech"}
            blurb={
              groupBy === "day"
                ? "Check one day for tonight's batch, or several to review everything so far. Whatever you ticked in the list above is already checked here."
                : "Check the kinds of word you want. Drilling one part of speech at a time is how the particles stop blurring into each other."
            }
            options={pickerOptions}
            selected={picked}
            onSelectedChange={setPicked}
            itemsFor={wordsFor}
          />
        </>
      )}
    </>
  );
}

/** Section keys carry a colon, which is not valid in a fragment identifier. */
function sectionId(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "-");
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      <span className="stat-note small">{note}</span>
    </div>
  );
}

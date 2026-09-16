"use client";

import { useMemo, useState } from "react";
import {
  groupByPos,
  groupByWeekDay,
  type BankGrammar,
  type BankWord,
} from "@/lib/bank-shared";
import { romanize } from "@/lib/romanize";
import type { QuizWord } from "@/lib/quiz";
import { Drill } from "./drill";

type GroupBy = "day" | "pos";
type Tab = "words" | "grammar";
/** Which column is hidden, for self-testing without leaving the page. */
type BlurField = "english" | "romanization" | "korean";

type Section = {
  key: string;
  title: string;
  subtitle?: string;
  words: BankWord[];
};

export function VocabularyView({
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
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // This week's days start open. Landing on a page of closed accordions makes
  // the student click before they can see anything, and this week's words are
  // what they came for; earlier weeks stay folded away.
  const [open, setOpen] = useState<Set<string>>(
    () =>
      new Set(
        words
          .filter((w) => w.weekNumber === currentWeek)
          .map((w) => `${w.weekNumber}:${w.studyDay}`),
      ),
  );
  const [blur, setBlur] = useState<Set<BlurField>>(new Set());
  // The drill replaces the list rather than sitting under it: the answers are
  // on this page, and a drill you can scroll away from is not a test of
  // anything.
  const [drill, setDrill] = useState<{ pool: QuizWord[]; label: string } | null>(null);

  // Intersected with the bank on purpose. A student may have practised words
  // from a week that has not been assigned yet — the drill pool is whatever
  // they select — and counting those here would put a bigger number on this
  // page than the dashboard shows for the same thing.
  const studied = useMemo(() => {
    const practised = new Set(studiedWords);
    return new Set(words.filter((w) => practised.has(w.id)).map((w) => w.id));
  }, [studiedWords, words]);

  const studiedG = useMemo(() => {
    const practised = new Set(studiedGrammar);
    return new Set(grammar.filter((g) => practised.has(g.id)).map((g) => g.id));
  }, [studiedGrammar, grammar]);

  // Romanization is derived once for the whole bank: it never changes, and
  // recomputing it inside a filter would redo 1,500 words on every keystroke.
  const roman = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of words) m.set(w.id, romanize(w.korean));
    return m;
  }, [words]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return words;
    return words.filter(
      (w) =>
        w.korean.includes(q) ||
        w.english.toLowerCase().includes(q) ||
        (roman.get(w.id) ?? "").includes(q) ||
        w.acceptedAnswers.some((a) => a.toLowerCase().includes(q)),
    );
  }, [words, query, roman]);

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

  const pickedWords = useMemo(
    () => sections.filter((s) => picked.has(s.key)).flatMap((s) => s.words),
    [sections, picked],
  );

  function toggleIn<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  function startDrill(pool: BankWord[], label: string) {
    setDrill({
      pool: pool.map((w) => ({
        id: w.id,
        korean: w.korean,
        english: w.english,
        acceptedAnswers: w.acceptedAnswers,
      })),
      label,
    });
    window.scrollTo({ top: 0 });
  }

  if (drill) {
    return (
      <>
        <div className="practice-bar">
          <span className="small">Practising {drill.label}</span>
          <button
            type="button"
            className="btn secondary"
            onClick={() => setDrill(null)}
          >
            Back to the list
          </button>
        </div>
        <Drill pool={drill.pool} kind="words" />
      </>
    );
  }

  const studiedThisWeek = words.filter(
    (w) => w.weekNumber === currentWeek && studied.has(w.id),
  ).length;
  const thisWeekTotal = words.filter((w) => w.weekNumber === currentWeek).length;

  return (
    <>
      <div className="stat-strip">
        <Stat label="Words assigned" value={words.length} note={`of ${goal} by term end`} />
        <Stat label="Studied" value={studied.size} note="right first time in practice" />
        <Stat
          label={`Week ${currentWeek}`}
          value={`${studiedThisWeek}/${thisWeekTotal}`}
          note="this week's words studied"
        />
        <Stat label="Grammar" value={`${studiedG.size}/${grammar.length}`} note="patterns studied" />
      </div>

      <div className="mode-row">
        <span className="mode-label">Show</span>
        <button
          type="button"
          className={`mode-btn ${tab === "words" ? "active" : ""}`}
          aria-pressed={tab === "words"}
          onClick={() => setTab("words")}
        >
          Words ({words.length})
        </button>
        <button
          type="button"
          className={`mode-btn ${tab === "grammar" ? "active" : ""}`}
          aria-pressed={tab === "grammar"}
          onClick={() => setTab("grammar")}
        >
          Grammar ({grammar.length})
        </button>
      </div>

      {tab === "grammar" ? (
        <>
          <div className="practice-bar">
            <span className="small">
              {studiedG.size} of {grammar.length} patterns studied
            </span>
            <button
              type="button"
              className="btn positive"
              onClick={() =>
                startDrill(
                  grammar.map((g) => ({
                    id: g.id,
                    korean: g.form,
                    english: g.name,
                    acceptedAnswers: [g.name, g.meaning],
                    partOfSpeech: null,
                    topic: null,
                    weekNumber: g.weekNumber,
                    studyDay: 0,
                  })),
                  `${grammar.length} grammar patterns`,
                )
              }
            >
              Practise grammar
            </button>
          </div>
          {grammar.map((g) => (
            <article key={g.id} className="grammar-card">
              <div className="grammar-head">
                <h3 lang="ko">{g.form}</h3>
                <span className="small">
                  {g.name} · week {g.weekNumber}
                  {studiedG.has(g.id) && (
                    <span className="pill pill-ok studied-pill">studied</span>
                  )}
                </span>
              </div>
              <p className="roman">{romanize(g.form)}</p>
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
              placeholder="Search Korean, English or romanization…"
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

          {/* Hiding a column turns the list into a self-test without leaving
              the page — cover the English and read down the Korean. */}
          <div className="mode-row">
            <span className="mode-label">Cover</span>
            {(["english", "romanization", "korean"] as BlurField[]).map((f) => (
              <button
                key={f}
                type="button"
                className={`mode-btn ${blur.has(f) ? "active" : ""}`}
                aria-pressed={blur.has(f)}
                onClick={() => setBlur((b) => toggleIn(b, f))}
              >
                {f === "english" ? "English" : f === "korean" ? "Korean" : "Romanization"}
              </button>
            ))}
          </div>

          <nav className="jump-card" aria-label="Jump to a section">
            <span className="mode-label">Jump to</span>
            <div className="jump-grid">
              {sections.map((s) => (
                <a key={s.key} className="jump-link" href={`#sec-${s.key.replace(":", "-")}`}>
                  {s.title} <span className="small">{s.words.length}</span>
                </a>
              ))}
            </div>
          </nav>

          <div className="practice-bar">
            <span className="small">
              {picked.size > 0
                ? `${pickedWords.length} words from ${picked.size} section${picked.size === 1 ? "" : "s"}`
                : `Nothing ticked — practice will use all ${filtered.length} shown`}
            </span>
            <button
              type="button"
              className="btn positive"
              disabled={filtered.length === 0}
              onClick={() =>
                startDrill(
                  picked.size > 0 ? pickedWords : filtered,
                  picked.size > 0
                    ? `${pickedWords.length} words from ${picked.size} section${picked.size === 1 ? "" : "s"}`
                    : `${filtered.length} words`,
                )
              }
            >
              Practise
            </button>
          </div>

          {sections.length === 0 && (
            <p className="small">Nothing matches &ldquo;{query}&rdquo;.</p>
          )}

          {sections.map((s) => {
            const isOpen = open.has(s.key) || query.trim().length > 0;
            const done = s.words.filter((w) => studied.has(w.id)).length;
            return (
              <section
                key={s.key}
                id={`sec-${s.key.replace(":", "-")}`}
                className="vocab-section"
              >
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
                  <div className="table-wrap">
                    <table className="vocab-table">
                      <thead>
                        <tr>
                          <th>English</th>
                          <th>Romanization</th>
                          <th>Korean</th>
                          <th>{groupBy === "day" ? "Part of speech" : "Day"}</th>
                          <th>Studied</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.words.map((w) => (
                          <tr key={w.id}>
                            <td>
                              <span className={blur.has("english") ? "covered" : ""}>
                                {w.english}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`roman ${blur.has("romanization") ? "covered" : ""}`}
                              >
                                {roman.get(w.id)}
                              </span>
                            </td>
                            <td>
                              <span
                                lang="ko"
                                className={`hangul ${blur.has("korean") ? "covered" : ""}`}
                              >
                                {w.korean}
                              </span>
                            </td>
                            <td className="small">
                              {groupBy === "day"
                                ? (w.partOfSpeech ?? "—")
                                : `W${w.weekNumber} D${w.studyDay}`}
                            </td>
                            <td>
                              {studied.has(w.id) ? (
                                <span className="studied-mark" title="Right first time in practice">
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
                )}
              </section>
            );
          })}
        </>
      )}
    </>
  );
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

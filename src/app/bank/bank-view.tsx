"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  groupByPos,
  groupByWeekDay,
  type BankGrammar,
  type BankWord,
} from "@/lib/bank-shared";

type Tab = "words" | "grammar";
type WordView = "pos" | "day";

export function BankView({
  words,
  grammar,
  currentWeek,
}: {
  words: BankWord[];
  grammar: BankGrammar[];
  currentWeek: number;
}) {
  const [tab, setTab] = useState<Tab>("words");
  const [view, setView] = useState<WordView>("day");
  const [query, setQuery] = useState("");
  // Study-day groups the student has ticked for a practice run.
  const [picked, setPicked] = useState<Set<string>>(new Set());

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

  const posGroups = useMemo(() => groupByPos(filtered), [filtered]);
  const dayGroups = useMemo(() => groupByWeekDay(filtered), [filtered]);

  function toggle(key: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const pickedCount = dayGroups
    .filter((g) => picked.has(g.key))
    .reduce((n, g) => n + g.words.length, 0);

  const practiceHref =
    picked.size > 0
      ? `/practice?kind=words&days=${[...picked].join(",")}`
      : `/practice?kind=words&week=${currentWeek}`;

  return (
    <div>
      <div className="mode-row">
        <span className="mode-label">Bank</span>
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

      {tab === "words" ? (
        <>
          <div className="mode-row">
            <span className="mode-label">Group by</span>
            <button
              type="button"
              className={`mode-btn ${view === "day" ? "active" : ""}`}
              aria-pressed={view === "day"}
              onClick={() => setView("day")}
            >
              Study day
            </button>
            <button
              type="button"
              className={`mode-btn ${view === "pos" ? "active" : ""}`}
              aria-pressed={view === "pos"}
              onClick={() => setView("pos")}
            >
              Part of speech
            </button>
            <input
              className="answer-input"
              style={{ minHeight: 42, flex: "1 1 200px" }}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Korean or English…"
              aria-label="Search the bank"
            />
          </div>

          <div className="practice-bar">
            <span className="small">
              {picked.size > 0
                ? `${pickedCount} words selected from ${picked.size} study ${picked.size === 1 ? "day" : "days"}`
                : `Nothing selected — practice will use week ${currentWeek}`}
            </span>
            <Link className="btn positive" href={practiceHref}>
              Practice
            </Link>
          </div>

          {view === "day"
            ? dayGroups.map((g) => (
                <section key={g.key} className="bank-group">
                  <label className="bank-group-head">
                    <input
                      type="checkbox"
                      checked={picked.has(g.key)}
                      onChange={() => toggle(g.key)}
                      className="bank-check"
                    />
                    <h3>
                      Week {g.week} · Day {g.day}
                    </h3>
                    <span className="small">{g.words.length} words</span>
                  </label>
                  <WordTable words={g.words} />
                </section>
              ))
            : posGroups.map((g) => (
                <section key={g.key} className="bank-group">
                  <div className="bank-group-head">
                    <h3>
                      {g.label} <span className="pos-korean">{g.korean}</span>
                    </h3>
                    <span className="small">{g.words.length} words</span>
                  </div>
                  <WordTable words={g.words} />
                </section>
              ))}

          {filtered.length === 0 && (
            <p className="small">No words match “{query}”.</p>
          )}
        </>
      ) : (
        <>
          <div className="practice-bar">
            <span className="small">
              {grammar.length} patterns assigned through week {currentWeek}
            </span>
            <Link className="btn positive" href="/practice?kind=grammar">
              Practice grammar
            </Link>
          </div>
          {grammar.map((g) => (
            <article key={g.id} className="grammar-card">
              <div className="grammar-head">
                <h3>{g.form}</h3>
                <span className="small">
                  {g.name} · week {g.weekNumber} · TOPIK{" "}
                  {g.level === 1 ? "I" : `II L${g.level}`}
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
        </>
      )}
    </div>
  );
}

function WordTable({ words }: { words: BankWord[] }) {
  return (
    <ul className="word-list">
      {words.map((w) => (
        <li key={w.id}>
          <span className="word-ko" lang="ko">
            {w.korean}
          </span>
          <span className="word-en">{w.english}</span>
          <span className="word-pos small">{w.partOfSpeech}</span>
        </li>
      ))}
    </ul>
  );
}

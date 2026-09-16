"use client";

import { useMemo, useState } from "react";
import type { BankWord } from "@/lib/bank-shared";
import type { Mode, QuizWord } from "@/lib/quiz";
import { Drill, type DrillOptions } from "./drill";

export type PickerOption = { key: string; label: string; count: number };

/**
 * Setting up a run before starting it.
 *
 * The bank above decides which picker this shows — study days when the list is
 * grouped by day, parts of speech when it is grouped by part of speech. Only
 * one exists at a time on purpose: a selection that mixed "day 3" with
 * "particles" would be two overlapping sets, and the count would stop meaning
 * anything the student could reason about.
 *
 * Whatever they ticked in the list arrives here already ticked, so the common
 * case is pressing Start.
 */
export function Exercise({
  title,
  kicker,
  blurb,
  options,
  selected,
  onSelectedChange,
  wordsFor,
}: {
  title: string;
  kicker: string;
  blurb: string;
  options: PickerOption[];
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  wordsFor: (keys: Set<string>) => BankWord[];
}) {
  // English → Korean by default: recall is the direction that fails first, and
  // the one the writing paper needs.
  const [questionMode, setQuestionMode] = useState<Mode>("english");
  const [answerMode, setAnswerMode] = useState<Mode>("korean");
  const [limit, setLimit] = useState(0);
  const [timerMinutes, setTimerMinutes] = useState(0);
  const [retryUntilRight, setRetryUntilRight] = useState(true);
  const [running, setRunning] = useState<{
    pool: QuizWord[];
    options: DrillOptions;
    label: string;
  } | null>(null);

  const chosen = useMemo(() => wordsFor(selected), [wordsFor, selected]);
  const willAsk = limit > 0 ? Math.min(limit, chosen.length) : chosen.length;

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedChange(next);
  }

  /** Question and answer language are locked opposite: same-language is not a test. */
  function setDirection(q: Mode) {
    setQuestionMode(q);
    setAnswerMode(q === "korean" ? "english" : "korean");
  }

  if (running) {
    return (
      <Drill
        pool={running.pool}
        options={running.options}
        label={running.label}
        onExit={() => setRunning(null)}
      />
    );
  }

  return (
    <section className="exercise-panel" id="exercise">
      <div className="exercise-panel-head">
        <span className="kicker">{kicker}</span>
        <h2>{title}</h2>
        <p className="small">{blurb}</p>
      </div>

      <div className="picker">
        <div className="picker-head">
          <span className="mode-label">What to practise</span>
          <div className="row-actions">
            <button
              type="button"
              className="btn secondary compact"
              onClick={() => onSelectedChange(new Set(options.map((o) => o.key)))}
            >
              All
            </button>
            <button
              type="button"
              className="btn secondary compact"
              onClick={() => onSelectedChange(new Set())}
            >
              None
            </button>
          </div>
        </div>
        <div className="option-grid">
          {options.map((o) => (
            <label key={o.key} className="option">
              <input
                type="checkbox"
                checked={selected.has(o.key)}
                onChange={() => toggle(o.key)}
              />
              <span>
                {o.label} <span className="small">{o.count}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="exercise-grid">
        <label>
          Question language
          <select
            value={questionMode}
            onChange={(e) => setDirection(e.target.value as Mode)}
          >
            <option value="english">English</option>
            <option value="korean">Korean</option>
          </select>
        </label>

        <label>
          Answer language
          <select value={answerMode} disabled>
            <option value="korean">Korean</option>
            <option value="english">English</option>
          </select>
          <small>Always the other one</small>
        </label>

        <label>
          Word limit
          <input
            type="number"
            min={0}
            step={5}
            value={limit}
            onChange={(e) => setLimit(Math.max(0, Number(e.target.value) || 0))}
          />
          <small>0 keeps every word selected</small>
        </label>

        <label>
          Timer in minutes
          <input
            type="number"
            min={0}
            step={1}
            value={timerMinutes}
            onChange={(e) => setTimerMinutes(Math.max(0, Number(e.target.value) || 0))}
          />
          <small>0 is untimed</small>
        </label>

        <label className="option retry-option">
          <input
            type="checkbox"
            checked={retryUntilRight}
            onChange={(e) => setRetryUntilRight(e.target.checked)}
          />
          <span>
            Retry a word until it is right
            <small>The answer stays hidden until the second miss</small>
          </span>
        </label>
      </div>

      <div className="exercise-actions">
        <span className={`menu-summary ${willAsk === 0 ? "is-empty" : ""}`}>
          {willAsk === 0
            ? "Nothing selected"
            : `${chosen.length} word${chosen.length === 1 ? "" : "s"} selected · ${willAsk} question${willAsk === 1 ? "" : "s"}${
                limit > 0 && chosen.length > limit ? ` sampled from ${chosen.length}` : ""
              }`}
        </span>
        <button
          type="button"
          className="btn primary"
          disabled={willAsk === 0}
          onClick={() =>
            setRunning({
              pool: chosen.map((w) => ({
                id: w.id,
                korean: w.korean,
                english: w.english,
                acceptedAnswers: w.acceptedAnswers,
              })),
              options: { questionMode, answerMode, limit, timerMinutes, retryUntilRight },
              label: `${willAsk} ${willAsk === 1 ? "word" : "words"} · ${title}`,
            })
          }
        >
          Start practice
        </button>
      </div>
    </section>
  );
}

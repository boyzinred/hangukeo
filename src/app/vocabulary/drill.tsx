"use client";

import { useMemo, useRef, useState } from "react";
import { savePracticeRun } from "./actions";
import {
  DIRECTION_LABELS,
  answerDisplay,
  buildQuestions,
  displayValue,
  isCorrect,
  type Direction,
  type Question,
  type QuizWord,
} from "@/lib/quiz";

const DIRECTIONS: Direction[] = ["ko_to_en", "en_to_ko", "mixed"];
const LENGTHS = [10, 20, 40, 0]; // 0 = every item in scope

type Result = {
  word: QuizWord;
  firstTry: boolean;
  isCorrect: boolean;
  answer: string;
};

export function Drill({
  pool,
  kind = "words",
  scope,
}: {
  pool: QuizWord[];
  kind?: "words" | "grammar";
  scope?: unknown;
}) {
  const [direction, setDirection] = useState<Direction>("ko_to_en");
  const [length, setLength] = useState(20);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [score, setScore] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  // A missed word is shown once more. It cannot score, but re-typing it is
  // most of the value of a drill.
  const [hadWrong, setHadWrong] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [feedback, setFeedback] = useState<
    { ok: boolean; text: string; key: string } | null
  >(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards against double-saving the same run.
  const savedRef = useRef(false);

  const current = questions?.[index] ?? null;
  const finished = questions !== null && index >= questions.length;

  const promptWords = useMemo(() => pool, [pool]);

  function start() {
    const qs = buildQuestions(pool, direction, length || undefined);
    setQuestions(qs);
    setIndex(0);
    setScore(0);
    setResults([]);
    setAnswer("");
    setFeedback(null);
    setHadWrong(false);
    setRetrying(false);
    savedRef.current = false;
    queueMicrotask(() => inputRef.current?.focus());
  }

  function check(e: React.FormEvent) {
    e.preventDefault();
    if (!current || feedback) return;

    const ok = isCorrect(
      promptWords,
      current.word,
      current.questionMode,
      current.answerMode,
      answer,
    );
    const key = answerDisplay(current.word, current.answerMode);

    if (ok) {
      if (!hadWrong) setScore((s) => s + 1);
      setResults((r) => [
        ...r,
        { word: current.word, firstTry: !hadWrong, isCorrect: true, answer },
      ]);
      setFeedback({
        ok: true,
        text: hadWrong ? "Correct on retry." : "Correct.",
        key,
      });
      setRetrying(false);
    } else if (!hadWrong) {
      // First miss — show the answer, then ask the same question again.
      setHadWrong(true);
      setRetrying(true);
      setFeedback({ ok: false, text: "Not quite. Try it once more.", key });
    } else {
      setResults((r) => [...r, { word: current.word, firstTry: false, isCorrect: false, answer }]);
      setFeedback({ ok: false, text: "Not quite.", key });
      setRetrying(false);
    }
  }

  function next() {
    setFeedback(null);
    setAnswer("");
    if (retrying) {
      // Same question again; hadWrong stays true so it cannot score.
      setRetrying(false);
    } else {
      const last = questions !== null && index + 1 >= questions.length;
      setIndex((i) => i + 1);
      setHadWrong(false);
      // Saved once, on the step past the final question. Practice feeds the
      // "studied" count only — mastery stays test-only.
      if (last && !savedRef.current) {
        savedRef.current = true;
        void savePracticeRun({
          kind,
          direction,
          scope,
          outcomes: results.map((r) => ({
            itemId: r.word.id,
            firstTry: r.firstTry,
            isCorrect: r.isCorrect,
          })),
        }).catch(() => {
          // A failed save must not interrupt the drill; the score on screen
          // is still correct, it just did not reach the teacher's dashboard.
          savedRef.current = false;
        });
      }
    }
    queueMicrotask(() => inputRef.current?.focus());
  }

  if (questions === null) {
    return (
      <Setup
        direction={direction}
        setDirection={setDirection}
        length={length}
        setLength={setLength}
        poolSize={pool.length}
        kind={kind}
        onStart={start}
      />
    );
  }

  if (finished) {
    const missed = results.filter((r) => !r.firstTry);
    return (
      <article className="quiz-card">
        <div className="exercise-head">
          <div>
            <span className="kicker">Exercise complete</span>
            <h3>Practice results</h3>
          </div>
          <div className="score" aria-live="polite">
            {score} / {questions.length}
          </div>
        </div>
        <div className="quiz-body">
          <p className="finish-headline">
            First-try score {score} / {questions.length}
          </p>
          <p className="small" style={{ marginTop: 0 }}>
            {DIRECTION_LABELS[direction]} · practice is not recorded toward your
            semester total — only weekly tests count.
          </p>

          {missed.length > 0 && (
            <>
              <h4>Words to review</h4>
              <ul className="review-list">
                {missed.map((r, i) => (
                  <li key={`${r.word.id}-${i}`}>
                    <strong>{r.word.korean}</strong>
                    <span>{r.word.english}</span>
                    <span className="small">you wrote: {r.answer || "—"}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="answer-form">
            <button className="btn positive" type="button" onClick={start}>
              Practice again
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() => setQuestions(null)}
            >
              Change settings
            </button>
          </div>
        </div>
      </article>
    );
  }

  const q = current!;
  const pct = Math.round((index / questions.length) * 100);

  return (
    <article className="quiz-card">
      <div className="exercise-head">
        <div>
          <span className="kicker">{DIRECTION_LABELS[direction]}</span>
          <h3>{kind === "grammar" ? "Grammar drill" : "Translation drill"}</h3>
        </div>
        <div className="score" aria-live="polite">
          {score} / {questions.length}
        </div>
      </div>

      <div className="quiz-body">
        <div className="status-row">
          <div>
            Question {index + 1} / {questions.length}
            {hadWrong && !feedback ? " · retry" : ""}
          </div>
          <div className="small">{pool.length} in scope</div>
        </div>

        <div
          className="progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Exercise progress"
        >
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>

        <div className="prompt-label">
          {q.questionMode === "korean" ? (kind === "grammar" ? "Pattern" : "Korean") : (kind === "grammar" ? "Meaning" : "English")}
        </div>
        <p className="prompt" lang={q.questionMode === "korean" ? "ko" : "en"}>
          {displayValue(q.word, q.questionMode)}
        </p>

        <form className="answer-form" onSubmit={check}>
          <label className="hidden" htmlFor="answer">
            Your answer in{" "}
            {q.answerMode === "korean" ? "Korean" : "English"}
          </label>
          <input
            id="answer"
            ref={inputRef}
            className="answer-input"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={!!feedback}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            lang={q.answerMode === "korean" ? "ko" : "en"}
            placeholder={
              q.answerMode === "korean" ? (kind === "grammar" ? "패턴을 입력" : "한국어로 입력") : "Type in English"
            }
          />
          {!feedback && (
            <button className="btn primary" type="submit">
              Check
            </button>
          )}
        </form>

        {feedback && (
          <>
            <div
              className={`feedback ${feedback.ok ? "good" : "bad"}`}
              aria-live="polite"
            >
              {feedback.ok ? "✓ " : "✗ "}
              {feedback.text}{" "}
              {(!feedback.ok || !retrying) && (
                <>
                  Answer: <span className="answer-key">{feedback.key}</span>
                </>
              )}
            </div>
            <div className="answer-form" style={{ marginTop: 16 }}>
              <button className="btn positive" type="button" onClick={next}>
                {retrying ? "Try again" : "Next"}
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function Setup({
  direction,
  setDirection,
  length,
  setLength,
  poolSize,
  kind,
  onStart,
}: {
  direction: Direction;
  setDirection: (d: Direction) => void;
  length: number;
  setLength: (n: number) => void;
  poolSize: number;
  kind: "words" | "grammar";
  onStart: () => void;
}) {
  return (
    <article className="quiz-card">
      <div className="exercise-head">
        <div>
          <span className="kicker">Setup</span>
          <h3>{kind === "grammar" ? "Grammar drill" : "Translation drill"}</h3>
        </div>
      </div>
      <div className="quiz-body">
        <div className="mode-row">
          <span className="mode-label">Direction</span>
          {DIRECTIONS.map((d) => (
            <button
              key={d}
              type="button"
              className={`mode-btn ${d === direction ? "active" : ""}`}
              aria-pressed={d === direction}
              onClick={() => setDirection(d)}
            >
              {DIRECTION_LABELS[d]}
            </button>
          ))}
        </div>

        <div className="mode-row">
          <span className="mode-label">Length</span>
          {LENGTHS.map((n) => (
            <button
              key={n}
              type="button"
              className={`mode-btn ${n === length ? "active" : ""}`}
              aria-pressed={n === length}
              onClick={() => setLength(n)}
              disabled={n > poolSize}
            >
              {n === 0 ? `All ${poolSize}` : n}
            </button>
          ))}
        </div>

        <button className="btn primary" type="button" onClick={onStart}>
          Start practice
        </button>
      </div>
    </article>
  );
}

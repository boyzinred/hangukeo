"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { savePracticeRun } from "./actions";
import { drillPhase } from "@/lib/drill-state";
import {
  answerDisplay,
  buildQuestions,
  displayValue,
  isCorrect,
  sentenceMatches,
  type Mode,
  type Question,
  type QuizWord,
} from "@/lib/quiz";

export type DrillOptions = {
  questionMode: Mode;
  answerMode: Mode;
  /** 0 keeps every selected word. */
  limit: number;
  /** 0 is untimed. */
  timerMinutes: number;
  retryUntilRight: boolean;
};

type Attempt = { text: string; correct: boolean };

type Result = {
  word: QuizWord;
  /** Right on the first attempt — the only kind that scores. */
  firstTry: boolean;
  attempts: Attempt[];
};

export const SEPARATORS = [
  { key: "slash", label: "/", value: " / " },
  { key: "dash", label: "–", value: " – " },
  { key: "comma", label: ",", value: ", " },
  { key: "tab", label: "Tab", value: "\t" },
];

/**
 * The drill.
 *
 * A wrong answer does not give the answer away. The first miss says only that
 * it was wrong, because being made to search for it once is most of what the
 * drill is for; the second shows it, because by then guessing again teaches
 * nothing. Only a first-time-correct answer scores, so a word recovered on the
 * retry is still a word to review.
 */
export function Drill({
  pool,
  options,
  label,
  kind = "words",
  /** Sentences are graded whole and ignore punctuation as well as spacing. */
  asSentences = false,
  /**
   * What a practice row is recorded against. A sentence's own id is unique to
   * the sentence, but what the student practised is the pattern behind it.
   */
  outcomeId,
  onExit,
}: {
  pool: QuizWord[];
  options: DrillOptions;
  label: string;
  kind?: "words" | "grammar";
  asSentences?: boolean;
  outcomeId?: (word: QuizWord) => string;
  onExit: () => void;
}) {
  const questions = useMemo(
    () =>
      buildQuestions(
        pool,
        options.questionMode === "korean" ? "ko_to_en" : "en_to_ko",
        options.limit > 0 ? options.limit : undefined,
      ),
    [pool, options.questionMode, options.limit],
  );

  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [separator, setSeparator] = useState(SEPARATORS[0].key);
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(
    options.timerMinutes > 0 ? Math.round(options.timerMinutes * 60) : 0,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const savedRef = useRef(false);
  // The countdown fires from outside React's render flow and needs the results
  // as they stand. Reading them through a state updater worked but ran a side
  // effect inside one, which StrictMode is entitled to do twice.
  const resultsRef = useRef<Result[]>([]);

  const question: Question | undefined = questions[index];
  const answered = attempts.length > 0 && attempts[attempts.length - 1].correct;
  const phase = drillPhase(attempts, options.retryUntilRight);
  const { revealed, mustRetry } = phase;

  const finish = useCallback(
    (final: Result[]) => {
      setFinished(true);
      if (savedRef.current) return;
      savedRef.current = true;
      // Practice is logged for the student's own studied count. It never feeds
      // the semester total, which is test-based.
      void savePracticeRun({
        kind,
        direction: `${options.questionMode}_to_${options.answerMode}`,
        scope: { label, asked: final.length },
        outcomes: final.map((r) => ({
          itemId: outcomeId ? outcomeId(r.word) : r.word.id,
          firstTry: r.firstTry,
          isCorrect: r.attempts.some((a) => a.correct),
        })),
      });
    },
    [kind, label, options.questionMode, options.answerMode, outcomeId],
  );

  // The countdown owns its own end: reaching zero finishes the run wherever
  // the student happens to be.
  useEffect(() => {
    if (options.timerMinutes <= 0 || finished) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          finish(resultsRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [options.timerMinutes, finished, finish]);

  useEffect(() => {
    if (!finished) inputRef.current?.focus();
  }, [index, finished]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!question || finished) return;
    const text = typed.trim();
    if (!text) return;

    const right = asSentences
      ? sentenceMatches(answerDisplay(question.word, question.answerMode), text)
      : isCorrect(
          pool,
          question.word,
          question.questionMode,
          question.answerMode,
          text,
        );
    const next = [...attempts, { text, correct: right }];
    setAttempts(next);
    setTyped("");

    if (!right) return;
    if (next.length === 1) setScore((s) => s + 1);
  }

  function advance() {
    if (!question) return;
    const record: Result = {
      word: question.word,
      firstTry: attempts.length === 1 && attempts[0].correct,
      attempts,
    };
    const all = [...results, record];
    resultsRef.current = all;
    setResults(all);
    setAttempts([]);
    setTyped("");
    if (index + 1 >= questions.length) finish(all);
    else setIndex(index + 1);
  }

  const missed = results.filter((r) => !r.firstTry);

  const markdown = useMemo(() => {
    const sep = SEPARATORS.find((s) => s.key === separator)?.value ?? " / ";
    const dir =
      options.questionMode === "korean" ? "Korean → English" : "English → Korean";
    return [
      `# Words to review — ${label} — ${new Date().toISOString().slice(0, 10)}`,
      `# ${dir} · ${missed.length} of ${results.length} · scored ${score}/${results.length}`,
      "",
      ...missed.map((r) => `${r.word.korean}${sep}${r.word.english}`),
      "",
    ].join("\n");
  }, [missed, results.length, score, separator, label, options.questionMode]);

  if (finished) {
    const pct = results.length ? Math.round((score / results.length) * 100) : 0;
    return (
      <article className="quiz-card">
        <div className="exercise-head">
          <div>
            <span className="kicker">Practice complete</span>
            <h3>{label}</h3>
          </div>
          <div className="score">
            {score} / {results.length}
          </div>
        </div>
        <div className="quiz-body">
          <p className="finish-headline">{pct}%</p>
          <p className="small">
            Scored on first-try answers only. Nothing here counts toward your
            semester total — only weekly tests do.
          </p>

          {missed.length > 0 ? (
            <>
              <h4>
                {missed.length} to review
              </h4>
              <ul className="review-list">
                {missed.map((r) => (
                  <li key={r.word.id} className="was-wrong">
                    <strong lang="ko">{r.word.korean}</strong>
                    <span>{r.word.english}</span>
                    <span className="small">
                      {r.attempts.length === 0
                        ? "not answered"
                        : r.attempts
                            .map((a, i) => `${i + 1}: ${a.text || "(blank)"}${a.correct ? " ✓" : " ✗"}`)
                            .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="export-block">
                <div className="export-head">
                  <h4>Take them with you</h4>
                  <div className="row-actions">
                    <select
                      className="compact-select"
                      value={separator}
                      onChange={(e) => setSeparator(e.target.value)}
                      aria-label="Separator between Korean and English"
                    >
                      {SEPARATORS.map((s) => (
                        <option key={s.key} value={s.key}>
                          Separator: {s.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn secondary compact"
                      onClick={async () => {
                        await navigator.clipboard.writeText(markdown);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1800);
                      }}
                    >
                      {copied ? "Copied" : "Copy as .md"}
                    </button>
                  </div>
                </div>
                <textarea
                  className="export-text"
                  readOnly
                  rows={Math.min(12, missed.length + 4)}
                  value={markdown}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Missed words as Markdown"
                />
              </div>
            </>
          ) : (
            <p>Everything right first time.</p>
          )}

          <div className="answer-form" style={{ marginTop: 18 }}>
            <button type="button" className="btn primary" onClick={onExit}>
              Back to the list
            </button>
          </div>
        </div>
      </article>
    );
  }

  if (!question) {
    return (
      <p className="small">
        Nothing to practise in this selection.{" "}
        <button type="button" className="link-btn" onClick={onExit}>
          Go back
        </button>
      </p>
    );
  }

  const prompt = displayValue(question.word, question.questionMode);
  const expected = answerDisplay(question.word, question.answerMode);
  const answerIsKorean = question.answerMode === "korean";
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  return (
    <article className="quiz-card">
      <div className="exercise-head">
        <div>
          <span className="kicker">
            Question {index + 1} of {questions.length}
          </span>
          <h3>{label}</h3>
        </div>
        <div className={`score ${options.timerMinutes > 0 && secondsLeft < 60 ? "score-low" : ""}`}>
          {options.timerMinutes > 0
            ? `${mins}:${String(secs).padStart(2, "0")}`
            : `${score}`}
        </div>
      </div>

      <div className="quiz-body">
        <div className="status-row">
          <div>Score {score}</div>
          <button type="button" className="link-btn" onClick={() => finish(results)}>
            End practice
          </button>
        </div>
        <div
          className="progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((index / questions.length) * 100)}
          aria-label="Practice progress"
        >
          <div
            className="progress-fill"
            style={{ width: `${Math.round((index / questions.length) * 100)}%` }}
          />
        </div>

        <div className="prompt-label">
          {asSentences
            ? "Translate into Korean"
            : question.questionMode === "korean"
              ? "Korean — answer in English"
              : "English — answer in Korean"}
        </div>
        <p
          className={`prompt ${asSentences ? "is-sentence" : ""}`}
          lang={question.questionMode === "korean" ? "ko" : "en"}
        >
          {prompt}
        </p>

        {phase.accepting && (
          <form className="answer-form" onSubmit={submit}>
            <label className="hidden" htmlFor="drill-answer">
              Your answer
            </label>
            <input
              id="drill-answer"
              ref={inputRef}
              className="answer-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              lang={answerIsKorean ? "ko" : "en"}
              placeholder={
                asSentences
                  ? "Type the whole sentence in Korean"
                  : answerIsKorean
                    ? "한국어로 입력"
                    : "Type in English"
              }
            />
            <button className="btn primary" type="submit">
              Check
            </button>
          </form>
        )}

        {attempts.length > 0 && (
          <p className={`feedback ${answered ? "good" : "bad"}`} role="status">
            {answered ? (
              <>
                {attempts.length === 1 ? "Correct." : "Correct on retry."}{" "}
                <span className="answer-key" lang={answerIsKorean ? "ko" : "en"}>
                  {expected}
                </span>
              </>
            ) : revealed ? (
              <>
                Not quite. The answer is{" "}
                <span className="answer-key" lang={answerIsKorean ? "ko" : "en"}>
                  {expected}
                </span>
                {mustRetry && " — type it to move on."}
              </>
            ) : (
              "Not quite. Try again."
            )}
          </p>
        )}

        {phase.canAdvance && (
          <div className="answer-form" style={{ marginTop: 14 }}>
            <button type="button" className="btn primary" onClick={advance}>
              {index + 1 >= questions.length ? "Finish" : "Next"}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { answer, beginTest, finishTest } from "./actions";
import type { ActiveAttempt } from "@/lib/test-taking";

/**
 * A question shows one language and offers the other, so the prompt's language
 * decides both — the options are always the opposite of the prompt. Reading
 * questions are the exception and are asked and answered in whichever language
 * the author wrote, so they are treated as English here.
 */
const PROMPT_LABEL: Record<string, string> = {
  ko_to_en_typed: "Korean — answer in English",
  en_to_ko_typed: "English — answer in Korean",
  vocab_choice: "Korean — choose the meaning",
  en_to_ko_choice: "English — choose the Korean",
  grammar_choice: "Grammar",
  reading_choice: "About the passage",
};

function promptIsKorean(format: string): boolean {
  return format === "ko_to_en_typed" || format === "vocab_choice";
}

type Phase =
  | { at: "idle" }
  | { at: "error"; message: string }
  | { at: "sitting"; attempt: ActiveAttempt }
  | { at: "done"; score: number; maxScore: number };

export function TestRunner({
  testId,
  title,
  timeLimitMinutes,
  questionCount,
}: {
  testId: string;
  title: string;
  timeLimitMinutes: number;
  questionCount: number;
}) {
  const [phase, setPhase] = useState<Phase>({ at: "idle" });
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const sitting = phase.at === "sitting" ? phase.attempt : null;
  const question = sitting?.questions[index] ?? null;

  // The countdown is a display of the server's expiry, not a timer of its own:
  // it recomputes from expiresAt every tick, so a slow tab or a sleeping
  // laptop cannot make it drift away from what the server will enforce.
  useEffect(() => {
    if (!sitting) return;
    const expiry = new Date(sitting.expiresAt).getTime();
    const tick = () =>
      setSeconds(Math.max(0, Math.floor((expiry - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sitting]);

  async function start() {
    setPhase({ at: "idle" });
    const res = await beginTest(testId);
    if (!res.ok) {
      setPhase({ at: "error", message: res.error });
      return;
    }
    setSaved(res.attempt.saved);
    setPhase({ at: "sitting", attempt: res.attempt });
    // Resume where they stopped rather than at question one.
    const firstUnanswered = res.attempt.questions.findIndex(
      (q) => !(q.id in res.attempt.saved),
    );
    const startAt = firstUnanswered === -1 ? 0 : firstUnanswered;
    setIndex(startAt);
    setDraft(res.attempt.saved[res.attempt.questions[startAt]?.id] ?? "");
    queueMicrotask(() => inputRef.current?.focus());
  }

  async function saveCurrent(): Promise<boolean> {
    if (!sitting || !question) return false;
    setSaving(true);
    const res = await answer({
      attemptId: sitting.attemptId,
      questionId: question.id,
      answer: draft,
    });
    setSaving(false);
    if (res.error) {
      setPhase({ at: "error", message: res.error });
      return false;
    }
    if (!res.saved) {
      // Server says time is up even if the countdown has not caught up.
      await submit();
      return false;
    }
    setSaved((s) => ({ ...s, [question.id]: draft }));
    return true;
  }

  function go(to: number) {
    if (!sitting) return;
    const clamped = Math.max(0, Math.min(sitting.questions.length - 1, to));
    setIndex(clamped);
    setDraft(saved[sitting.questions[clamped].id] ?? "");
    queueMicrotask(() => inputRef.current?.focus());
  }

  async function next() {
    if (!(await saveCurrent())) return;
    if (!sitting) return;
    if (index + 1 >= sitting.questions.length) return;
    go(index + 1);
  }

  async function submit() {
    if (!sitting) return;
    const res = await finishTest(sitting.attemptId);
    if (res.ok) setPhase({ at: "done", score: res.score, maxScore: res.maxScore });
    else setPhase({ at: "error", message: res.error });
  }

  if (phase.at === "error") {
    return (
      <article className="quiz-card">
        <div className="exercise-head">
          <div>
            <span className="kicker">Test</span>
            <h3>{title}</h3>
          </div>
        </div>
        <div className="quiz-body">
          <p className="feedback bad" role="status">
            {phase.message}
          </p>
        </div>
      </article>
    );
  }

  if (phase.at === "done") {
    const pct = phase.maxScore
      ? Math.round((phase.score / phase.maxScore) * 100)
      : 0;
    return (
      <article className="quiz-card">
        <div className="exercise-head">
          <div>
            <span className="kicker">Submitted</span>
            <h3>{title}</h3>
          </div>
          <div className="score" aria-live="polite">
            {phase.score} / {phase.maxScore}
          </div>
        </div>
        <div className="quiz-body">
          <p className="finish-headline">{pct}%</p>
          <p className="small">
            Your answers are recorded. Anything the grader could not resolve is
            flagged for your teacher, so a score may still move slightly.
          </p>
        </div>
      </article>
    );
  }

  if (phase.at === "idle") {
    return (
      <article className="quiz-card">
        <div className="exercise-head">
          <div>
            <span className="kicker">Weekly test</span>
            <h3>{title}</h3>
          </div>
        </div>
        <div className="quiz-body">
          <p>
            {questionCount} questions, {timeLimitMinutes} minutes. The clock
            starts when you begin and runs on the server, so closing the tab
            does not pause it.
          </p>
          <p className="small">
            Every answer is saved as you give it. If something goes wrong you
            can return and carry on from where you stopped.
          </p>
          <div className="answer-form" style={{ marginTop: 18 }}>
            <button className="btn primary" type="button" onClick={start}>
              Start the test
            </button>
          </div>
        </div>
      </article>
    );
  }

  const q = question!;
  const answeredCount = Object.keys(saved).length;
  const pct = Math.round((answeredCount / sitting!.questions.length) * 100);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const low = seconds > 0 && seconds < 120;

  return (
    <article className="quiz-card">
      <div className="exercise-head">
        <div>
          <span className="kicker">
            {q.section} · question {index + 1} of {sitting!.questions.length}
          </span>
          <h3>{title}</h3>
        </div>
        <div className={`score ${low ? "score-low" : ""}`} aria-live="off">
          {mins}:{String(secs).padStart(2, "0")}
        </div>
      </div>

      <div className="quiz-body">
        <div className="status-row">
          <div>
            {answeredCount} of {sitting!.questions.length} answered
          </div>
          <div className="small">{saving ? "Saving…" : "Saved"}</div>
        </div>
        <div
          className="progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Questions answered"
        >
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>

        {/* Reading questions are about the passage, so it has to be in front
            of the student while they answer — not on a page they left behind. */}
        {q.section === "reading" && sitting!.passage && (
          <div className="passage-panel">
            <div className="prompt-label">Read this</div>
            <p className="passage" lang="ko">
              {sitting!.passage}
            </p>
          </div>
        )}

        <div className="prompt-label">{PROMPT_LABEL[q.format] ?? "Question"}</div>
        <p className="prompt" lang={promptIsKorean(q.format) ? "ko" : "en"}>
          {q.prompt}
        </p>

        {q.choices && q.choices.length > 0 ? (
          <div className="choice-list">
            {q.choices.map((c) => (
              <button
                key={c}
                type="button"
                className={`choice ${draft === c ? "chosen" : ""}`}
                lang={promptIsKorean(q.format) ? "en" : "ko"}
                onClick={() => setDraft(c)}
              >
                {c}
              </button>
            ))}
          </div>
        ) : (
          <form
            className="answer-form"
            onSubmit={(e) => {
              e.preventDefault();
              void next();
            }}
          >
            <label className="hidden" htmlFor="test-answer">
              Your answer
            </label>
            <input
              id="test-answer"
              ref={inputRef}
              className="answer-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              lang={q.format === "en_to_ko_typed" ? "ko" : "en"}
              placeholder={
                q.format === "en_to_ko_typed" ? "한국어로 입력" : "Type in English"
              }
            />
          </form>
        )}

        <div className="answer-form" style={{ marginTop: 18 }}>
          <button
            className="btn secondary"
            type="button"
            disabled={index === 0 || saving}
            onClick={async () => {
              if (await saveCurrent()) go(index - 1);
            }}
          >
            Back
          </button>
          {index + 1 < sitting!.questions.length ? (
            <button
              className="btn primary"
              type="button"
              disabled={saving}
              onClick={next}
            >
              Next
            </button>
          ) : (
            <button
              className="btn positive"
              type="button"
              disabled={saving}
              onClick={async () => {
                if (await saveCurrent()) await submit();
              }}
            >
              Submit test
            </button>
          )}
        </div>

        <p className="small" style={{ marginTop: 14 }}>
          You can move back and change an answer until you submit.
        </p>
      </div>
    </article>
  );
}

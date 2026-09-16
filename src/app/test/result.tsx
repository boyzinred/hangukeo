import type { attemptResult } from "@/lib/test-taking";

type Result = NonNullable<Awaited<ReturnType<typeof attemptResult>>>;

/**
 * A sat test, read back.
 *
 * Shows every question rather than only the wrong ones: a student looking back
 * at week 2 wants to see what they were asked, and an unanswered question is
 * as much a part of that as a wrong one. The passage comes with it, because a
 * reading question read without it says nothing.
 */
export function TestResult({ result }: { result: Result }) {
  const pct = result.maxScore
    ? Math.round((result.score / result.maxScore) * 100)
    : 0;
  const missed = result.answers.filter((a) => !a.isCorrect);
  const flagged = result.answers.filter((a) => a.needsReview).length;

  return (
    <article className="quiz-card">
      <div className="exercise-head">
        <div>
          <span className="kicker">Submitted</span>
          <h3>{result.title}</h3>
        </div>
        <div className="score">
          {result.score} / {result.maxScore}
        </div>
      </div>

      <div className="quiz-body">
        <p className="finish-headline">{pct}%</p>
        {result.submittedAt && (
          <p className="small" style={{ marginTop: 0 }}>
            Submitted{" "}
            {result.submittedAt.toISOString().slice(0, 16).replace("T", " ")}.
            {flagged > 0 &&
              ` ${flagged} answer${flagged === 1 ? " is" : "s are"} flagged for your teacher, so this may still move.`}
          </p>
        )}

        {result.passage && (
          <div className="passage-panel">
            <div className="prompt-label">The passage</div>
            <p className="passage" lang="ko">
              {result.passage}
            </p>
          </div>
        )}

        <h4>
          {missed.length === 0
            ? "Everything correct"
            : `What to review (${missed.length})`}
        </h4>
        <ul className="review-list">
          {result.answers.map((a) => (
            <li
              key={a.questionId}
              className={a.isCorrect ? "was-right" : "was-wrong"}
            >
              <strong lang={a.format === "ko_to_en_typed" ? "ko" : "en"}>
                {a.prompt}
              </strong>
              <span lang={a.format === "en_to_ko_typed" ? "ko" : "en"}>
                {a.correct}
              </span>
              <span className="small">
                {a.given
                  ? `you wrote: ${a.given}`
                  : "you did not answer this one"}
                {a.isCorrect ? " · correct" : ""}
                {a.needsReview ? " · flagged for your teacher" : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

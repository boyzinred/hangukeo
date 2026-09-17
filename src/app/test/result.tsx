import type { attemptResult } from "@/lib/test-taking";

type Result = NonNullable<Awaited<ReturnType<typeof attemptResult>>>;
type Answer = Result["answers"][number];

const SECTION_LABEL: Record<string, string> = {
  vocabulary: "Vocabulary",
  grammar: "Grammar",
  reading: "Reading",
};

const FORMAT_LABEL: Record<string, string> = {
  ko_to_en_typed: "Korean → English",
  en_to_ko_typed: "English → Korean",
  vocab_choice: "Korean → English",
  en_to_ko_choice: "English → Korean",
  grammar_choice: "Grammar",
  reading_choice: "About the passage",
};

/** The prompt's language; options are always the other one. */
function promptIsKorean(format: string): boolean {
  return format === "ko_to_en_typed" || format === "vocab_choice";
}

/**
 * A sat test, read back whole.
 *
 * Every question in order, with the options it offered and both marks on them
 * — the right answer and the one taken. Showing only the missed questions, or
 * only the correct answer without the options, leaves the student unable to
 * see the thing most worth seeing: which distractor they fell for, and how
 * close it was. Unanswered questions are here too, since running out of time
 * is a different problem from getting it wrong and should not look the same.
 */
export function TestResult({ result }: { result: Result }) {
  const pct = result.maxScore
    ? Math.round((result.score / result.maxScore) * 100)
    : 0;
  const skipped = result.answers.filter((a) => a.given === null).length;
  // Answered and wrong. An unanswered question is not a wrong answer, and
  // adding it to both counts made the two numbers overlap.
  const missed = result.answers.filter((a) => !a.isCorrect && a.given !== null);
  const flagged = result.answers.filter((a) => a.needsReview).length;

  const sections = ["vocabulary", "grammar", "reading"].filter((s) =>
    result.answers.some((a) => a.section === s),
  );
  const other = result.answers.filter((a) => !sections.includes(a.section));

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
        <p className="small" style={{ marginTop: 0 }}>
          {result.submittedAt &&
            `Submitted ${result.submittedAt.toISOString().slice(0, 16).replace("T", " ")}. `}
          {missed.length} wrong
          {skipped > 0 && `, ${skipped} not answered`}.
          {flagged > 0 &&
            ` ${flagged} answer${flagged === 1 ? " is" : "s are"} flagged for your teacher, so this may still move.`}
        </p>

        {result.passage && (
          <div className="passage-panel">
            <div className="prompt-label">The passage</div>
            <p className="passage" lang="ko">
              {result.passage}
            </p>
          </div>
        )}

        {sections.map((section) => {
          const rows = result.answers.filter((a) => a.section === section);
          const right = rows.filter((a) => a.isCorrect).length;
          return (
            <section key={section}>
              <h4 className="result-section-head">
                {SECTION_LABEL[section] ?? section}{" "}
                <span className="small">
                  {right} of {rows.length} right
                </span>
              </h4>
              <ol className="result-list">
                {rows.map((a) => (
                  <ResultRow key={a.questionId} a={a} />
                ))}
              </ol>
            </section>
          );
        })}

        {other.length > 0 && (
          <ol className="result-list">
            {other.map((a) => (
              <ResultRow key={a.questionId} a={a} />
            ))}
          </ol>
        )}
      </div>
    </article>
  );
}

function ResultRow({ a }: { a: Answer }) {
  const unanswered = a.given === null;
  const koreanPrompt = promptIsKorean(a.format);
  const optionLang = koreanPrompt ? "en" : "ko";

  return (
    <li
      className={`result-q ${a.isCorrect ? "was-right" : unanswered ? "was-skipped" : "was-wrong"}`}
    >
      <div className="result-q-head">
        <span className="result-q-number">{a.position}</span>
        <span className="small">{FORMAT_LABEL[a.format] ?? a.format}</span>
        <span className={`pill ${a.isCorrect ? "pill-ok" : "pill-behind"}`}>
          {a.isCorrect ? "correct" : unanswered ? "not answered" : "wrong"}
        </span>
      </div>

      <p className="result-prompt" lang={koreanPrompt ? "ko" : "en"}>
        {a.prompt}
      </p>

      {a.choices && a.choices.length > 0 ? (
        <ul className="result-choices">
          {a.choices.map((c) => {
            const isAnswer = c === a.correct;
            const isMine = c === a.given;
            return (
              <li
                key={c}
                lang={optionLang}
                className={`${isAnswer ? "is-answer" : ""} ${isMine ? "is-mine" : ""}`}
              >
                <span>{c}</span>
                <span className="small result-tag">
                  {isAnswer && isMine
                    ? "your answer · correct"
                    : isAnswer
                      ? "correct answer"
                      : isMine
                        ? "you chose this"
                        : ""}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <dl className="result-typed">
          <dt>Answer</dt>
          <dd lang={optionLang}>{a.correct}</dd>
          <dt>You wrote</dt>
          <dd lang={optionLang}>{a.given || "—"}</dd>
        </dl>
      )}

      {a.needsReview && (
        <p className="small">Flagged for your teacher — this mark may change.</p>
      )}
    </li>
  );
}

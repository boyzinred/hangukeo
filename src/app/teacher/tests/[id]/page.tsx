import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/session";
import { auditTest } from "@/lib/test-import";
import { testDetail, type PreviewQuestion } from "@/lib/tests";
import { PreviewActions } from "./preview-actions";

export const metadata = { title: "Test preview · hangukeo" };

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  review: "Read, awaiting the teacher",
  published: "Open to students",
  closed: "Closed",
};

const FORMAT_LABEL: Record<string, string> = {
  ko_to_en_typed: "Korean → English, typed",
  en_to_ko_typed: "English → Korean, typed",
  vocab_choice: "Korean → English",
  en_to_ko_choice: "English → Korean",
  grammar_choice: "Grammar",
  reading_choice: "Reading",
};

/** The prompt's language; options are always the other one. */
function promptIsKorean(format: string): boolean {
  return format === "ko_to_en_typed" || format === "vocab_choice";
}

/**
 * The whole test, exactly as it will be asked, with the answers.
 *
 * Deliberately read-only. A test is a file: it is written, validated against
 * the corpus and imported. Editing questions here would put a second source of
 * truth in the database that the file no longer matches, and the next import
 * would silently undo the edit. So the teacher reads, says what should change,
 * and the file is regenerated and re-imported.
 */
export default async function TestPreview({
  params,
}: PageProps<"/teacher/tests/[id]">) {
  await requireStaff();
  const { id } = await params;

  const [test, audit] = await Promise.all([testDetail(id), auditTest(id).catch(() => null)]);
  if (!test) notFound();

  const errors = audit?.findings.filter((f) => f.level === "error") ?? [];
  const warnings = audit?.findings.filter((f) => f.level === "warning") ?? [];
  // Publication is only ahead of a draft. For a test already sat, the same
  // findings are history rather than a gate, and should not read as a threat.
  const decidable = test.status === "draft" || test.status === "review";

  const bySection = {
    vocabulary: test.questions.filter((q) => q.section === "vocabulary"),
    grammar: test.questions.filter((q) => q.section === "grammar"),
    reading: test.questions.filter((q) => q.section === "reading"),
  };
  const newCount = bySection.vocabulary.filter(
    (q) => q.link?.kind === "vocab" && q.link.assignedWeek === test.weekNumber,
  ).length;
  const reviewCount = bySection.vocabulary.length - newCount;
  const unlinked = test.questions.filter((q) => !q.link).length;

  return (
    <main className="shell">
      <section className="hero">
        <span className="kicker">
          Week {test.weekNumber} · {test.startsOn} to {test.endsOn}
        </span>
        <h1>{test.title}</h1>
        <p>
          {test.questions.length} questions in {test.timeLimitMinutes} minutes —{" "}
          {newCount} new words, {reviewCount} review, {bySection.grammar.length}{" "}
          grammar, {bySection.reading.length} reading.{" "}
          {test.attemptCount > 0
            ? `${test.submittedCount} of ${test.attemptCount} students have submitted.`
            : "Nobody has sat it yet."}
        </p>
      </section>

      <div className="section-body">
        <div className="teacher-toolbar">
          <span className={`pill status-${test.status}`}>
            {STATUS_LABEL[test.status]}
          </span>
          {(test.status === "published" || test.status === "closed") && (
            <Link
              className={`btn ${test.flaggedCount > 0 ? "positive" : "secondary"}`}
              href={`/teacher/review?test=${test.id}`}
            >
              {test.flaggedCount > 0
                ? `Review ${test.flaggedCount} answer${test.flaggedCount === 1 ? "" : "s"}`
                : "Review answers"}
            </Link>
          )}
          <Link className="btn secondary" href="/teacher/tests">
            All weeks
          </Link>
        </div>

        <PreviewActions
          testId={test.id}
          status={test.status}
          attemptCount={test.attemptCount}
          blocked={errors.length > 0}
        />

        {errors.length > 0 && (
          <div className="panel">
            <div className="panel-head">
              <h2>
                {decidable ? "This test cannot be published" : "Problems with this test"}
              </h2>
              <span className="small">
                {decidable
                  ? "Each of these would leave a score that feeds no statistic."
                  : "Each of these means a score here feeds no statistic. It is already out, so this is for the record."}
              </span>
            </div>
            <div className="panel-body">
              <ul className="finding-list">
                {errors.map((f, i) => (
                  <li key={i} className="finding-error">
                    {f.message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="panel">
            <div className="panel-head">
              <h2>Worth knowing</h2>
              <span className="small">
                {decidable
                  ? "None of these stop publication — they are for your judgement."
                  : "None of these were blocking; they are noted for the record."}
              </span>
            </div>
            <div className="panel-body">
              <ul className="finding-list">
                {warnings.map((f, i) => (
                  <li key={i} className="finding-warning">
                    {f.message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <p className="small legend-note">
          Nothing on this page can be edited. A test is written as a file and
          imported, so the file stays the single source of what the class sat.
          Note what you want changed, and it is regenerated and re-imported.
          {unlinked > 0 && (
            <>
              {" "}
              {unlinked} question{unlinked === 1 ? "" : "s"} on this test{" "}
              {unlinked === 1 ? "carries" : "carry"} no corpus word, so{" "}
              {unlinked === 1 ? "it counts" : "they count"} toward the score
              only.
            </>
          )}
        </p>

        {test.passageKo && (
          <>
            <h2 className="section-heading">Reading passage</h2>
            <div className="panel">
              <div className="panel-body">
                <p className="passage" lang="ko">
                  {test.passageKo}
                </p>
                {test.passageEn && (
                  <p className="passage-gloss small">
                    <strong>Your translation:</strong> {test.passageEn} — this is
                    never shown to students.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        <Section
          title="Vocabulary"
          note={`${newCount} from week ${test.weekNumber}, ${reviewCount} from earlier weeks`}
          questions={bySection.vocabulary}
          weekNumber={test.weekNumber}
        />
        <Section
          title="Grammar"
          note="The pattern's own name is the answer the grader compares against"
          questions={bySection.grammar}
          weekNumber={test.weekNumber}
        />
        <Section
          title="Reading"
          note="Asked against the passage above"
          questions={bySection.reading}
          weekNumber={test.weekNumber}
        />
      </div>
    </main>
  );
}

function Section({
  title,
  note,
  questions,
  weekNumber,
}: {
  title: string;
  note: string;
  questions: PreviewQuestion[];
  weekNumber: number;
}) {
  if (questions.length === 0) return null;
  return (
    <>
      <h2 className="section-heading">
        {title} <span className="small">({questions.length})</span>
      </h2>
      <p className="small legend-note">{note}</p>
      <ol className="preview-list">
        {questions.map((q) => (
          <li key={q.id} className="preview-q">
            <div className="preview-q-head">
              <span className="preview-q-number">{q.position}</span>
              <span className="small">{FORMAT_LABEL[q.format] ?? q.format}</span>
              {q.link?.kind === "vocab" && (
                <span
                  className={`pill ${
                    q.link.assignedWeek === weekNumber ? "pill-ok" : "pill-student"
                  }`}
                >
                  {q.link.assignedWeek === weekNumber
                    ? "new"
                    : `review · week ${q.link.assignedWeek ?? "?"}`}
                </span>
              )}
              {!q.link && <span className="pill pill-behind">scores only</span>}
            </div>

            <p
              className="preview-prompt"
              lang={promptIsKorean(q.format) ? "ko" : "en"}
            >
              {q.prompt}
            </p>

            {q.choices && q.choices.length > 0 ? (
              <ul className="preview-choices">
                {q.choices.map((c) => (
                  <li
                    key={c}
                    lang={promptIsKorean(q.format) ? "en" : "ko"}
                    className={c === q.correctAnswer ? "is-correct" : undefined}
                  >
                    {c}
                    {c === q.correctAnswer && (
                      <span className="small"> · correct</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="preview-answer">
                <strong lang={q.format === "en_to_ko_typed" ? "ko" : "en"}>
                  {q.correctAnswer}
                </strong>
                {q.acceptedAnswers.filter((a) => a !== q.correctAnswer).length >
                  0 && (
                  <span className="small">
                    {" "}
                    · also accepted:{" "}
                    {q.acceptedAnswers
                      .filter((a) => a !== q.correctAnswer)
                      .join(", ")}
                  </span>
                )}
              </p>
            )}

            <p className="small preview-link">
              {q.link?.kind === "vocab" && (
                <>
                  <code>{q.link.id}</code> {q.link.korean} · {q.link.english}
                </>
              )}
              {q.link?.kind === "grammar" && (
                <>
                  <code>{q.link.id}</code> {q.link.form} · {q.link.name} ·{" "}
                  {q.link.meaning}
                </>
              )}
              {!q.link && "No corpus link — this feeds no word's mastery."}
            </p>
          </li>
        ))}
      </ol>
    </>
  );
}

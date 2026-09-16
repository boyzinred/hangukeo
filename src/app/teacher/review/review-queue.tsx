"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FlaggedAnswer } from "@/lib/review";
import { resolve, type ReviewResult } from "./actions";

/**
 * One row per answer, not per student.
 *
 * Accepting is the heavier of the two decisions, so it says what it will do:
 * for an English answer it can be written back to the word, and then the same
 * synonym never reaches this queue again. A Korean answer cannot — the corpus
 * keeps English alternates and has no column for Korean ones — so accepting
 * settles the students in front of you and nothing more, and the row says so
 * rather than leaving it to be noticed.
 */
export function ReviewQueue({ items }: { items: FlaggedAnswer[] }) {
  const router = useRouter();
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [teach, setTeach] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  function act(item: FlaggedAnswer, accept: boolean) {
    setResult(null);
    setBusy(item.key);
    startTransition(async () => {
      const res = await resolve({
        questionId: item.questionId,
        answer: item.answer,
        accept,
        teachGrader: teach[item.key] ?? item.canTeachGrader,
      });
      setResult(res);
      setBusy(null);
      if (res.ok) {
        // Hide it immediately rather than waiting for the refresh, so working
        // down a long queue does not make the list jump under the cursor.
        setDone((d) => new Set(d).add(item.key));
        router.refresh();
      }
    });
  }

  const remaining = items.filter((i) => !done.has(i.key));

  return (
    <>
      {result && (
        <p className={`feedback ${result.ok ? "good" : "bad"}`} role="status">
          {result.ok ? result.message : result.error}
        </p>
      )}

      {remaining.length === 0 ? (
        <p className="small">Queue cleared. Nothing left waiting.</p>
      ) : (
        <ul className="queue-list">
          {remaining.map((item) => {
            const working = busy === item.key;
            const teaching = teach[item.key] ?? item.canTeachGrader;
            const asked =
              item.format === "ko_to_en_typed"
                ? "Korean → English"
                : "English → Korean";

            return (
              <li key={item.key} className="queue-row">
                <div className="queue-head">
                  <span className="pill pill-student">
                    {item.students.length} student
                    {item.students.length === 1 ? "" : "s"}
                  </span>
                  <span className="small">
                    Week {item.weekNumber} · {asked}
                  </span>
                </div>

                <dl className="queue-grid">
                  <dt>Asked</dt>
                  <dd lang={item.format === "ko_to_en_typed" ? "ko" : "en"}>
                    {item.prompt}
                  </dd>

                  <dt>Expected</dt>
                  <dd lang={item.format === "en_to_ko_typed" ? "ko" : "en"}>
                    {item.correctAnswer}
                    {item.acceptedAnswers.filter((a) => a !== item.correctAnswer)
                      .length > 0 && (
                      <span className="small">
                        {" "}
                        · also accepted:{" "}
                        {item.acceptedAnswers
                          .filter((a) => a !== item.correctAnswer)
                          .join(", ")}
                      </span>
                    )}
                  </dd>

                  <dt>They wrote</dt>
                  <dd
                    className="queue-answer"
                    lang={item.format === "en_to_ko_typed" ? "ko" : "en"}
                  >
                    {item.answer}
                    {item.spellings.length > 1 && (
                      <span className="small">
                        {" "}
                        · also written {item.spellings.slice(1).join(", ")}
                      </span>
                    )}
                  </dd>
                </dl>

                <p className="small queue-students">
                  {item.students.map((s) => s.displayName).join(", ")}
                </p>

                {item.canTeachGrader && (
                  <label className="check queue-teach">
                    <input
                      type="checkbox"
                      checked={teaching}
                      disabled={working}
                      onChange={(e) =>
                        setTeach((t) => ({ ...t, [item.key]: e.target.checked }))
                      }
                    />
                    <span>
                      If accepted, add it to{" "}
                      <strong lang="ko">{item.korean}</strong>&apos;s accepted
                      answers so it passes from now on
                    </span>
                  </label>
                )}
                {!item.canTeachGrader && (
                  <p className="small queue-note">
                    Accepting settles these {item.students.length} answer
                    {item.students.length === 1 ? "" : "s"} only — the corpus
                    keeps English alternates, so a Korean spelling cannot be
                    taught to the grader here.
                  </p>
                )}

                <div className="row-actions">
                  <button
                    type="button"
                    className="btn positive compact"
                    disabled={working}
                    onClick={() => act(item, true)}
                  >
                    {working ? "Saving…" : "Accept"}
                  </button>
                  <button
                    type="button"
                    className="btn danger compact"
                    disabled={working}
                    onClick={() => act(item, false)}
                  >
                    Mark wrong
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

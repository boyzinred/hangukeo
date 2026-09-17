"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  closeTest,
  discardTest,
  markForReview,
  publishTest,
  unpublishTest,
  type TestActionResult,
} from "../actions";

/**
 * The decisions a test can be moved through, in the one place the whole test
 * is visible. Publishing from a list, without reading what is in it, is the
 * thing this workflow exists to prevent.
 *
 * "Mark as read" survives now that a TA can publish: having the power to
 * decide alone is not the same as wanting to, and a TA who has read a draft
 * and would rather the teacher took it still needs a way to say so.
 */
export function PreviewActions({
  testId,
  status,
  attemptCount,
  blocked,
}: {
  testId: string;
  status: "draft" | "review" | "published" | "closed";
  attemptCount: number;
  /** The audit found an error, so publishing would be refused anyway. */
  blocked: boolean;
}) {
  const router = useRouter();
  const [result, setResult] = useState<TestActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  function run(
    fn: () => Promise<TestActionResult>,
    { leavesPage = false }: { leavesPage?: boolean } = {},
  ) {
    setResult(null);
    setBusy(true);
    startTransition(async () => {
      const res = await fn();
      setResult(res);
      setBusy(false);
      // A discarded test no longer has a page to stay on.
      if (res.ok && leavesPage) router.push("/teacher/tests");
      else router.refresh();
    });
  }

  return (
    <>
      {result && (
        <p className={`feedback ${result.ok ? "good" : "bad"}`} role="status">
          {result.ok ? result.message : result.error}
        </p>
      )}

      <div className="row-actions preview-actions">
        {status !== "published" && status !== "closed" && (
          <>
            <button
              type="button"
              className="btn positive"
              disabled={busy || blocked}
              title={
                blocked
                  ? "Fix the errors below and re-import before publishing"
                  : undefined
              }
              onClick={() => run(() => publishTest(testId))}
            >
              Publish to students
            </button>
            {status === "draft" && (
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                title="Say you have read it without deciding to send it out"
                onClick={() => run(() => markForReview(testId))}
              >
                Mark as read
              </button>
            )}
          </>
        )}

        {status === "published" && (
          <>
            <button
              type="button"
              className="btn secondary"
              disabled={busy || attemptCount > 0}
              title={
                attemptCount > 0
                  ? "Students have started it — close it instead"
                  : undefined
              }
              onClick={() => run(() => unpublishTest(testId))}
            >
              Unpublish
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => run(() => closeTest(testId))}
            >
              Close the test
            </button>
          </>
        )}

        <button
          type="button"
          className="btn danger"
          disabled={busy || attemptCount > 0}
          title={attemptCount > 0 ? "Students have started this test" : undefined}
          onClick={() => run(() => discardTest(testId), { leavesPage: true })}
        >
          Discard
        </button>
      </div>
    </>
  );
}

/**
 * What the drill should be showing after a given run of attempts.
 *
 * Pulled out of the component because it is a small decision table with four
 * rules crossing two settings, and getting it wrong is invisible: a drill that
 * reveals the answer one attempt early still looks like it works.
 *
 * The rule: a first miss says only that it was wrong. Being made to search for
 * it once is most of what a drill is for. The second miss shows the answer,
 * because by then another guess teaches nothing.
 *
 * Pure, and free of imports, so both the component and a check can use it.
 */

export type DrillPhase = {
  /** The answer is on screen. */
  revealed: boolean;
  /** The student must answer again before moving on. */
  mustRetry: boolean;
  /** The input takes text. */
  accepting: boolean;
  /** Next/Finish is available. */
  canAdvance: boolean;
};

export function drillPhase(
  attempts: { correct: boolean }[],
  retryUntilRight: boolean,
): DrillPhase {
  const answered = attempts.length > 0 && attempts[attempts.length - 1].correct;
  const wrong = attempts.filter((a) => !a.correct).length;

  const revealed = wrong >= 2 || (!retryUntilRight && wrong >= 1);
  const mustRetry = retryUntilRight && !answered && wrong > 0;

  return {
    revealed,
    mustRetry,
    accepting: !answered && (attempts.length === 0 || mustRetry),
    canAdvance: attempts.length > 0 && (answered || !mustRetry),
  };
}

/** Only a right answer at the first attempt counts toward the score. */
export function scores(attempts: { correct: boolean }[]): boolean {
  return attempts.length === 1 && attempts[0].correct;
}

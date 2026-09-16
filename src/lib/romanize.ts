/**
 * Hangul → Latin, one syllable at a time.
 *
 * A strict character-by-character transliteration, not standard Revised
 * Romanization: it does not apply the sound changes that happen across
 * syllable boundaries. That is deliberate. A learner reading 학교 wants to see
 * which letters are on the page — hak-gyo — rather than how it is pronounced
 * once assimilation has had its way. The dashes are for reading and mean
 * nothing to any comparison.
 *
 * Matches the word bank this page is modelled on, so a student moving between
 * the two sees the same spelling for the same word.
 *
 * Pure, and free of any import, so the client bundle can have it.
 */

// Initial and final forms differ for ㄱ g/k, ㄷ d/t, ㄹ r/l, ㅂ b/p.
const CHO = ["g","gg","n","d","dd","r","m","b","bb","s","ss","","j","jj","ch","k","t","p","h"];
const JUNG = ["a","ae","ya","yae","eo","e","yeo","ye","o","oa","oae","oi","yo","u","ueo","ue","ui","yu","eu","eui","i"];
const JONG = ["","k","kk","ks","n","nj","nh","t","l","lk","lm","lp","ls","lt","lp","lh","m","p","ps","s","ss","ng","j","ch","k","t","p","h"];

const SYLLABLE_START = 0xac00;
const SYLLABLE_END = 0xd7a3;

export function romanize(text: string): string {
  return String(text ?? "")
    .split(" ")
    .map((word) => {
      const parts: string[] = [];
      let syllables: string[] = [];

      for (const ch of word) {
        const code = ch.codePointAt(0)!;
        if (code >= SYLLABLE_START && code <= SYLLABLE_END) {
          const offset = code - SYLLABLE_START;
          syllables.push(
            CHO[Math.floor(offset / (28 * 21))] +
              JUNG[Math.floor(offset / 28) % 21] +
              JONG[offset % 28],
          );
          continue;
        }
        // Anything that is not a syllable block — punctuation, a lone jamo,
        // a Latin letter — ends the run and passes through untouched.
        if (syllables.length) {
          parts.push(syllables.join("-"));
          syllables = [];
        }
        parts.push(ch);
      }

      if (syllables.length) parts.push(syllables.join("-"));
      return parts.join("");
    })
    .join(" ");
}

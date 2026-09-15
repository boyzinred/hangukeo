import { randomInt } from "node:crypto";

/**
 * Passphrase generator for teacher-issued credentials.
 *
 * Deliberately word-based rather than random characters. These passwords get
 * read off a screen, written on paper, and typed by a teenager on a phone
 * keyboard — `amber-tiger-quiet-47` survives that journey; `xK7#mQ2$vL` does
 * not, and gets written down wrong or reset every week.
 *
 * Entropy: four words from a 128-word list plus a two-digit number is
 * 4 * 7 + ~6.6 ≈ 34.6 bits. That is weak against an offline attack on a stolen
 * hash, and strong against someone guessing at a login form — which is the
 * only threat here, since Supabase rate-limits sign-in attempts and the site
 * holds vocabulary scores. Raise WORD_COUNT if that calculus ever changes.
 */

// 128 words: short, unambiguous, no homophones, no letters that confuse
// (no "l"/"I" collisions), nothing that reads as a slur or an insult.
const WORDS = [
  "amber", "anchor", "apple", "arrow", "autumn", "bamboo", "banjo", "basil",
  "beacon", "birch", "bison", "blossom", "bottle", "branch", "bridge", "bronze",
  "butter", "cactus", "candle", "canyon", "carbon", "castle", "cedar", "cherry",
  "cinder", "cobalt", "comet", "copper", "coral", "cotton", "cricket", "crystal",
  "damson", "daisy", "dolphin", "donkey", "dragon", "ember", "falcon", "fennel",
  "ferret", "fjord", "forest", "fossil", "garnet", "ginger", "glacier", "granite",
  "harbor", "hazel", "heron", "hollow", "indigo", "ivory", "jasmine", "jungle",
  "kernel", "kettle", "lagoon", "lantern", "laurel", "lemon", "lichen", "linen",
  "lobster", "lotus", "magnet", "mango", "maple", "marble", "meadow", "mellow",
  "mercury", "meteor", "mimosa", "monsoon", "mosaic", "nectar", "nimbus", "nutmeg",
  "oasis", "ochre", "olive", "orchid", "osprey", "otter", "oyster", "pebble",
  "pepper", "petal", "pewter", "pigeon", "pilot", "pollen", "poplar", "prairie",
  "quartz", "quiet", "quiver", "radish", "rattan", "ribbon", "ripple", "river",
  "rocket", "rubble", "saffron", "sandal", "sapphire", "shadow", "sierra", "silver",
  "sorrel", "spruce", "squash", "stanza", "sunset", "tangent", "teapot", "thicket",
  "thistle", "tiger", "timber", "tinder", "tulip", "tundra", "velvet", "walnut",
];

const WORD_COUNT = 4;

export function generatePassword(): string {
  const words = Array.from(
    { length: WORD_COUNT },
    () => WORDS[randomInt(WORDS.length)],
  );
  // Two digits, never leading zero, so it reads and dictates cleanly.
  return `${words.join("-")}-${randomInt(10, 100)}`;
}

/** Bits of entropy, for anyone auditing the choice above. */
export function passwordEntropyBits(): number {
  return WORD_COUNT * Math.log2(WORDS.length) + Math.log2(90);
}

/**
 * Usernames are what students type, so they are lowercase, ASCII, and short.
 * The suffix only appears when the plain name is taken.
 */
export function suggestUsername(displayName: string): string {
  const base = displayName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 16);
  return base || "student";
}

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,30}$/;

export function isValidUsername(u: string): boolean {
  return USERNAME_RE.test(u);
}

/**
 * Supabase Auth requires an email-shaped identifier. Nothing is ever sent to
 * these addresses — `.invalid` is reserved by RFC 2606 precisely so it can
 * never resolve, which makes an accidental send impossible rather than merely
 * unlikely.
 */
export const SYNTHETIC_EMAIL_DOMAIN = "hangukeo.invalid";

export function syntheticEmail(username: string): string {
  return `${username.toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

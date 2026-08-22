/**
 * The individually-testable, deterministic spam heuristics (#20, epic #8):
 * honeypot, link flood, mostly-links, repetition/character flooding,
 * all-caps ratio, a small spam-keyword list, and empty-after-trim. Each is a
 * small pure predicate over already-normalized text — no I/O, no clock, no
 * external service, no LLM call — composed by `./evaluate.ts` into the
 * single spam decision. Thresholds live here, not in the exported rejection
 * reason (`./evaluate.ts`'s `ContactRejectionReason`), so a rejection never
 * leaks the values below to an anonymous caller.
 */

/** Fires when the honeypot field — left empty by legitimate clients — has any content. */
export function honeypotFilled(submission: { honeypot: string }): boolean {
  return submission.honeypot.trim().length > 0;
}

/** Matches `http(s)://...` and bare `www....` links, stopping at whitespace. */
const LINK_PATTERN = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;

/** More than this many links in one message is treated as link flooding. */
const LINK_FLOOD_THRESHOLD = 3;

function findLinks(text: string): string[] {
  return text.match(LINK_PATTERN) ?? [];
}

/** Fires when the message contains more than {@link LINK_FLOOD_THRESHOLD} links. */
export function hasLinkFlood(message: string): boolean {
  return findLinks(message).length > LINK_FLOOD_THRESHOLD;
}

/** A message whose link characters exceed this share of its non-whitespace content is "mostly links". */
const MOSTLY_LINKS_RATIO = 0.5;

/** Fires when links make up more than {@link MOSTLY_LINKS_RATIO} of the message's non-whitespace characters. */
export function isMostlyLinks(message: string): boolean {
  const links = findLinks(message);
  if (links.length === 0) {
    return false;
  }
  const linkChars = links.reduce((sum, link) => sum + link.length, 0);
  const nonWhitespaceLength = message.replace(/\s+/g, "").length;
  if (nonWhitespaceLength === 0) {
    return false;
  }
  return linkChars / nonWhitespaceLength > MOSTLY_LINKS_RATIO;
}

/** 10 or more of the same character in a row (e.g. "aaaaaaaaaa") counts as character flooding. */
const CHAR_FLOOD_PATTERN = /(.)\1{9,}/;

/** The same word repeated this many times in a row counts as word flooding. */
const WORD_FLOOD_MIN_REPEATS = 4;

/** Fires on obvious repetition: a flooded character run, or the same word repeated back to back. */
export function hasRepetitionFlood(message: string): boolean {
  if (CHAR_FLOOD_PATTERN.test(message)) {
    return true;
  }

  const words = message.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  let run = 1;
  for (let i = 1; i < words.length; i++) {
    run = words[i] === words[i - 1] ? run + 1 : 1;
    if (run >= WORD_FLOOD_MIN_REPEATS) {
      return true;
    }
  }
  return false;
}

/** A message must have at least this many letters before the all-caps ratio is meaningful. */
const ALL_CAPS_MIN_LETTERS = 20;

/** More than this share of uppercase letters (among all letters) counts as all-caps flooding. */
const ALL_CAPS_RATIO_THRESHOLD = 0.7;

/** Fires when a sufficiently long message is mostly uppercase letters. */
export function hasAllCapsFlood(message: string): boolean {
  const letters = message.replace(/[^a-zA-Z]/g, "");
  if (letters.length < ALL_CAPS_MIN_LETTERS) {
    return false;
  }
  const upperCaseLetters = letters.replace(/[^A-Z]/g, "").length;
  return upperCaseLetters / letters.length > ALL_CAPS_RATIO_THRESHOLD;
}

/** A small, deliberately simple list of classic spam-offer phrases, matched case-insensitively. */
const SPAM_KEYWORDS = [
  "buy now",
  "click here",
  "act now",
  "wire transfer",
  "guaranteed income",
  "make money fast",
  "risk-free investment",
  "forex trading",
  "crypto giveaway",
  "lottery winner",
  "viagra",
  "weight loss miracle",
  "work from home opportunity",
  "congratulations you have been selected",
  "nigerian prince",
];

/** Fires when the message contains any phrase from {@link SPAM_KEYWORDS}. */
export function hasSpamKeyword(message: string): boolean {
  const lower = message.toLowerCase();
  return SPAM_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/** Fires when `name`, `contact` or `message` is empty once trimmed (e.g. a whitespace-only value). */
export function isEmptyAfterTrim(submission: {
  name: string;
  contact: string;
  message: string;
}): boolean {
  return (
    submission.name.trim().length === 0 ||
    submission.contact.trim().length === 0 ||
    submission.message.trim().length === 0
  );
}

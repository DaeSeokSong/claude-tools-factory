// Pure, dependency-free helpers: X-weighted thread splitting and hashtag linting.
// No network, no state — heavily unit-tested.

/**
 * X's weighted character count. X allows 280 "weighted" characters: code points up to
 * U+10FF (plus a few punctuation ranges) count as 1, everything else — CJK, Korean Hangul,
 * Japanese, full-width forms, emoji — counts as 2. This mirrors X's twitter-text config so
 * the limit here matches what X actually enforces.
 */
function charWeight(c: number): number {
  if (c <= 0x10ff) return 1;
  if ((c >= 0x2000 && c <= 0x200d) || (c >= 0x2010 && c <= 0x201f) || (c >= 0x2032 && c <= 0x2037)) return 1;
  return 2;
}

export function xWeight(text: string): number {
  let w = 0;
  for (const ch of text) w += charWeight(ch.codePointAt(0)!);
  return w;
}

/** Longest prefix of `s` whose weighted length is ≤ maxWeight, plus the remainder. */
function takeWeight(s: string, maxWeight: number): [string, string] {
  let w = 0;
  let i = 0;
  for (const ch of s) {
    const cw = charWeight(ch.codePointAt(0)!);
    if (w + cw > maxWeight) break;
    w += cw;
    i += ch.length; // advance by UTF-16 units (handles surrogate pairs)
  }
  return [s.slice(0, i), s.slice(i)];
}

/**
 * Split `text` into ordered segments each within `limit` X-weighted chars, breaking on word
 * boundaries (hard-splitting only an oversized token such as a long URL). When `number` is
 * true, a " (i/n)" counter is appended and its width reserved so the numbered segment still
 * fits. Text that already fits returns unchanged (newlines preserved).
 */
export function splitThread(text: string, limit: number, number = true): string[] {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  if (xWeight(t) <= limit) return [t];

  // The numbering suffix is ASCII (weight == length); its size depends on the segment count,
  // which depends on the reservation — iterate to a fixed point (converges in 1–2 passes).
  let segs: string[] = [];
  let count = 1;
  for (let iter = 0; iter < 6; iter++) {
    const suffixLen = number ? ` (${count}/${count})`.length : 0;
    const budget = Math.max(1, limit - suffixLen);
    segs = greedyPack(t, budget);
    if (segs.length === count) break;
    count = segs.length;
  }
  if (!number) return segs;
  const n = segs.length;
  return segs.map((s, i) => `${s} (${i + 1}/${n})`);
}

/** Greedily pack whitespace-separated words into pieces of at most `budget` weighted chars. */
function greedyPack(text: string, budget: number): string[] {
  const out: string[] = [];
  let cur = "";
  let curW = 0;
  for (let word of text.split(/\s+/).filter(Boolean)) {
    // A single token heavier than the budget (e.g. a long URL or CJK run) is hard-split.
    while (xWeight(word) > budget) {
      if (cur) {
        out.push(cur);
        cur = "";
        curW = 0;
      }
      let [head, rest] = takeWeight(word, budget);
      if (!head) {
        // budget smaller than one char — take a single code point so we never stall
        head = [...word][0] ?? "";
        rest = word.slice(head.length);
      }
      out.push(head);
      word = rest;
    }
    const ww = xWeight(word);
    if (!cur) {
      cur = word;
      curW = ww;
    } else if (curW + 1 + ww <= budget) {
      cur += " " + word;
      curW += 1 + ww;
    } else {
      out.push(cur);
      cur = word;
      curW = ww;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export interface HashtagLint {
  count: number;
  tags: string[];
  warn: boolean;
  note: string;
}

/**
 * Lint hashtags for X reach. In 2026 X ranks by semantic NLP, not hashtags; 3+ hashtags
 * trip spam filters and *reduce* reach, while 0–2 niche tags are fine. This only advises.
 */
export function lintHashtags(text: string): HashtagLint {
  const tags = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  const count = tags.length;
  const warn = count >= 3;
  const note = warn
    ? `${count} hashtags — X reduces reach (spam filter) at 3+. Use 0–2 niche tags.`
    : count === 0
      ? "no hashtags — fine (X ranks by semantics, not tags)"
      : `${count} hashtag(s) — OK (keep it to 1–2 niche tags).`;
  return { count, tags, warn, note };
}

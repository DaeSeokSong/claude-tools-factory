// Pure, dependency-free helpers: thread splitting (X's 280-char limit) and hashtag linting.
// No network, no state — heavily unit-tested.

/**
 * Split `text` into ordered segments that each fit `limit` characters, breaking on word
 * boundaries (hard-splitting only an oversized token such as a long URL). When `number`
 * is true, a " (i/n)" counter is appended and its width reserved so the numbered segment
 * still fits. Text that already fits returns unchanged (newlines preserved).
 */
export function splitThread(text: string, limit: number, number = true): string[] {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  if (t.length <= limit) return [t];

  // Numbering suffix length depends on the segment count, which depends on the suffix
  // length — iterate to a fixed point (converges in 1–2 passes).
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

function greedyPack(text: string, budget: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (word.length > budget) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      out.push(word.slice(0, budget));
      word = word.slice(budget);
    }
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= budget) cur += " " + word;
    else {
      out.push(cur);
      cur = word;
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

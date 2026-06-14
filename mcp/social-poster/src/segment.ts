// Pure, dependency-free text → thread splitting. Heavily tested; no network, no state.

/**
 * Split `text` into ordered segments that each fit `limit` characters, breaking on word
 * boundaries (hard-splitting only an oversized token such as a long URL). When `number`
 * is true, a " (i/n)" counter is appended and its width is reserved so the numbered
 * segment still fits `limit`. Text that already fits returns unchanged (newlines kept).
 */
export function splitThread(text: string, limit: number, number = true): string[] {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  if (t.length <= limit) return [t];

  // The numbering suffix length depends on the segment count, which depends on the
  // suffix length — iterate to a fixed point (converges in 1–2 passes in practice).
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

/** Greedily pack whitespace-separated words into pieces of at most `budget` chars. */
function greedyPack(text: string, budget: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (let word of text.split(/\s+/).filter(Boolean)) {
    // A single token longer than the budget (e.g. a URL) is hard-split.
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

export interface PlatformPlan {
  platform: string;
  charLimit: number;
  segments: string[];
  /** True if every segment is within the platform's limit (always true after splitThread). */
  withinLimit: boolean;
}

/** Build the segment plan for one platform from raw text. */
export function planFor(platform: string, charLimit: number, text: string, number = true): PlatformPlan {
  const segments = splitThread(text, charLimit, number);
  return { platform, charLimit, segments, withinLimit: segments.every((s) => s.length <= charLimit) };
}

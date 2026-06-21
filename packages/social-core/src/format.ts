// Pure, dependency-free formatting shared by the social MCP servers:
// Slack mrkdwn cleanup + per-platform packaging (X weighted thread, LinkedIn single post).
// No network, no state.

export const X_CHAR_LIMIT = 280;
export const LINKEDIN_CHAR_LIMIT = 3000;

// ─── Slack mrkdwn -> clean text ────────────────────────────────────────────────

/**
 * Convert Slack message markup to clean plain text suitable for SNS:
 * unwraps bold / italic / strike / inline-code, turns <url|label> into "label (url)",
 * <#C123|chan> into #chan, drops <@U123> mentions, and decodes Slack HTML entities.
 */
export function slackToText(s: string): string {
  return s
    .replace(/```([\s\S]*?)```/g, (_m, c: string) => c.trim()) // code fences -> inner
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/\*([^*\n]+)\*/g, "$1") // *bold*
    .replace(/(^|[\s(])_([^_\n]+)_/g, "$1$2") // _italic_ (avoid snake_case mid-word)
    .replace(/~([^~\n]+)~/g, "$1") // ~strike~
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1") // channel link -> #name
    .replace(/<@[A-Z0-9]+>/g, "") // user mention -> drop
    .replace(/<!(?:here|channel|everyone)>/g, "") // broadcast mentions -> drop
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2 ($1)") // <url|label> -> label (url)
    .replace(/<(https?:[^>]+)>/g, "$1") // <url> -> url
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n") // trailing spaces
    .replace(/\n{3,}/g, "\n\n") // collapse big gaps
    .trim();
}

export function countHashtags(text: string): number {
  return (text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
}

// ─── X weighted length + thread split ────────────────────────────────────────────

function charWeight(c: number): number {
  if (c <= 0x10ff) return 1;
  if ((c >= 0x2000 && c <= 0x200d) || (c >= 0x2010 && c <= 0x201f) || (c >= 0x2032 && c <= 0x2037)) return 1;
  return 2;
}
/** X-weighted character count (CJK/Korean/Japanese/emoji = 2), matching X's limit. */
export function xWeight(text: string): number {
  let w = 0;
  for (const ch of text) w += charWeight(ch.codePointAt(0)!);
  return w;
}
function takeWeight(s: string, maxWeight: number): [string, string] {
  let w = 0;
  let i = 0;
  for (const ch of s) {
    const cw = charWeight(ch.codePointAt(0)!);
    if (w + cw > maxWeight) break;
    w += cw;
    i += ch.length;
  }
  return [s.slice(0, i), s.slice(i)];
}
/** Split into ordered segments each within `limit` X-weighted chars; numbered when threaded. */
export function splitThread(text: string, limit: number, number = true): string[] {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (!t) return [];
  if (xWeight(t) <= limit) return [t];
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
  let curW = 0;
  for (let word of text.split(/\s+/).filter(Boolean)) {
    while (xWeight(word) > budget) {
      if (cur) {
        out.push(cur);
        cur = "";
        curW = 0;
      }
      let [head, rest] = takeWeight(word, budget);
      if (!head) {
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

// ─── per-platform plans ─────────────────────────────────────────────────────────

export interface XPlan {
  segments: string[];
  hashtags: number;
  hashtagWarn: boolean;
  note: string;
}
export function planX(clean: string, number = true): XPlan {
  const segments = splitThread(clean, X_CHAR_LIMIT, number);
  const hashtags = countHashtags(clean);
  const hashtagWarn = hashtags >= 3;
  const note = hashtagWarn
    ? `${hashtags} hashtags — X reduces reach at 3+. Use 0–2 niche tags.`
    : `${hashtags} hashtag(s) — OK for X (0–2 is ideal).`;
  return { segments, hashtags, hashtagWarn, note };
}

/** LinkedIn counts characters (code points incl. spaces/emoji/newlines) against 3000. */
export function linkedinLength(text: string): number {
  return [...text].length;
}
export interface LinkedInPlan {
  text: string;
  length: number;
  withinLimit: boolean;
  seeMore: string; // the first ~210 chars shown before "see more"
  hashtags: number;
  hashtagWarn: boolean;
  note: string;
}
export function planLinkedIn(clean: string): LinkedInPlan {
  const length = linkedinLength(clean);
  const hashtags = countHashtags(clean);
  const hashtagWarn = hashtags > 5;
  const note = hashtagWarn
    ? `${hashtags} hashtags — LinkedIn cuts reach (~-68%) above 5. Use 3–5 at the end.`
    : `${hashtags} hashtag(s) — ${hashtags === 0 ? "fine; 3–5 niche tags at the end can help" : "OK (3–5 is ideal on LinkedIn)"}.`;
  return {
    text: clean,
    length,
    withinLimit: length <= LINKEDIN_CHAR_LIMIT,
    seeMore: [...clean].slice(0, 210).join(""),
    hashtags,
    hashtagWarn,
    note,
  };
}

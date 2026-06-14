import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { cosine } from "./embed.js";

export type Outcome = "success" | "failure" | "partial";

/** One recorded attempt: a one-line title, the 5W1H, root cause, result, and a resolution. */
export interface ExperienceRecord {
  id: string;
  title: string; //      one-line summary (for dated digests / RAG headlines)
  who: string; //        WHO  acted (model / agent / user)
  what: string; //       WHAT was attempted (the matching key)
  when: string; //       WHEN (ISO timestamp)
  where: string; //      WHERE (repo / file / environment / project)
  why: string; //        WHY  (intent / goal)
  how: string; //        HOW  (method / approach)
  outcome: Outcome;
  rootCause: string; //  why it failed or succeeded
  result: string; //     detailed observed result
  resolution: string; // for failures: the fix / what to do next time
  tags: string[];
  fingerprint: string; // normalized hash of `what`, used to detect repeats
}

export interface Match {
  record: ExperienceRecord;
  kind: "exact" | "similar";
  score: number;
}

export interface Ranked {
  record: ExperienceRecord;
  score: number;
}

/** Walk up from `start` looking for `filename`; return its path or null. */
function findUp(filename: string, start: string): string | null {
  let dir = start;
  for (;;) {
    const p = join(dir, filename);
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Where the ledger lives, resolved in priority order:
 *   1. EXPERIENCE_LEDGER_PATH (explicit override), else
 *   2. $CLAUDE_PROJECT_DIR/.experience-ledger.jsonl — Claude Code sets CLAUDE_PROJECT_DIR
 *      in the MCP server's environment, so a repo's committed ledger is used automatically
 *      and reliably (independent of the process working directory), else
 *   3. the nearest `.experience-ledger.jsonl` found by walking up from the cwd (covers
 *      other MCP clients / CLI use), else
 *   4. the personal ledger at ~/.experience-ledger/ledger.jsonl.
 */
export function ledgerPath(): string {
  if (process.env.EXPERIENCE_LEDGER_PATH) return process.env.EXPERIENCE_LEDGER_PATH;
  const projDir = process.env.CLAUDE_PROJECT_DIR;
  if (projDir) {
    const p = join(projDir, ".experience-ledger.jsonl");
    if (existsSync(p)) return p;
  }
  const found = findUp(".experience-ledger.jsonl", process.cwd());
  if (found) return found;
  return join(homedir(), ".experience-ledger", "ledger.jsonl");
}

const norm = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

export function fingerprint(what: string): string {
  return createHash("sha1").update(norm(what)).digest("hex").slice(0, 12);
}

export function newId(): string {
  return randomUUID();
}

/** Calendar day (YYYY-MM-DD) of a record, for dated digests. */
export function dayOf(r: ExperienceRecord): string {
  return r.when.slice(0, 10);
}

export function loadAll(): ExperienceRecord[] {
  const p = ledgerPath();
  if (!existsSync(p)) return [];
  const out: ExperienceRecord[] = [];
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as ExperienceRecord);
    } catch {
      // Skip a corrupt line rather than failing the whole read.
    }
  }
  return out;
}

export function append(rec: ExperienceRecord): void {
  const p = ledgerPath();
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify(rec) + "\n", "utf8");
}

function tokenSet(s: string): Set<string> {
  return new Set(norm(s).split(" ").filter((w) => w.length > 2));
}

/** Overlap of significant tokens, normalized to [0,1]. */
export function similarity(a: string, b: string): number {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

/** Prior attempts at the same (exact fingerprint) or a similar (token-overlap) action. */
export function findMatches(what: string, all: ExperienceRecord[], threshold = 0.6): Match[] {
  const fp = fingerprint(what);
  const matches: Match[] = [];
  for (const r of all) {
    if (r.fingerprint === fp) {
      matches.push({ record: r, kind: "exact", score: 1 });
      continue;
    }
    const s = similarity(what, r.what);
    if (s >= threshold) matches.push({ record: r, kind: "similar", score: s });
  }
  return matches.sort((a, b) => b.score - a.score || b.record.when.localeCompare(a.record.when));
}

/** Relevance of a free-text query to a whole record (title/what/why/result/cause/resolution/tags). */
export function relevance(query: string, r: ExperienceRecord): number {
  const hay = [r.title, r.what, r.why, r.result, r.rootCause, r.resolution, r.tags.join(" ")].join(" ");
  return similarity(query, hay);
}

/** Lexical "RAG" retrieval: records most relevant to a query, best first. */
export function rankByRelevance(query: string, all: ExperienceRecord[], min = 0.15): Ranked[] {
  return all
    .map((r) => ({ record: r, score: relevance(query, r) }))
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score || b.record.when.localeCompare(a.record.when));
}

/** Chronological chain of every attempt sharing a fingerprint — the causal "DAG" over one action. */
export function chainFor(fp: string, all: ExperienceRecord[]): ExperienceRecord[] {
  return all.filter((r) => r.fingerprint === fp).sort((a, b) => a.when.localeCompare(b.when));
}

// ─── Vector ("semantic") retrieval ────────────────────────────────────────────
// Embeddings live in a sidecar cache next to the ledger (one `{id, e}` per line), so
// the human-readable ledger stays clean and diff-friendly. The cache is optional and
// regenerable; retrieval falls back to lexical whenever it is absent.

/** The single text embedded for a record (same fields the lexical relevance uses). */
export function recordText(r: ExperienceRecord): string {
  return [r.title, r.what, r.why, r.result, r.rootCause, r.resolution, r.tags.join(" ")]
    .filter((s) => s && s.trim())
    .join("\n");
}

/** Sidecar embedding cache path: `<ledger>.vec.jsonl`. */
export function vectorPath(): string {
  return ledgerPath() + ".vec.jsonl";
}

/** Load id → embedding from the sidecar cache (empty map if none). */
export function loadVectors(): Map<string, number[]> {
  const p = vectorPath();
  const m = new Map<string, number[]>();
  if (!existsSync(p)) return m;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t) as { id?: string; e?: number[] };
      if (o.id && Array.isArray(o.e)) m.set(o.id, o.e);
    } catch {
      // skip a corrupt cache line
    }
  }
  return m;
}

/** Append one embedding to the sidecar cache. */
export function appendVector(id: string, e: number[]): void {
  const p = vectorPath();
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify({ id, e }) + "\n", "utf8");
}

/**
 * Hybrid retrieval. With a query embedding + cached vectors, fuse the lexical and
 * vector rankings via Reciprocal Rank Fusion (robust, scale-free); otherwise fall
 * back to the lexical ranking unchanged. RRF score = Σ 1/(k + rank) over each list.
 */
export function rankHybrid(
  query: string,
  all: ExperienceRecord[],
  queryVec: number[] | null,
  vectors: Map<string, number[]>,
  limit = 8,
  k = 60,
): Ranked[] {
  if (!queryVec || vectors.size === 0) return rankByRelevance(query, all).slice(0, limit);

  const lexOrder = all
    .map((r) => ({ id: r.id, s: relevance(query, r) }))
    .sort((a, b) => b.s - a.s);
  const lexRank = new Map(lexOrder.map((x, i) => [x.id, i]));

  const vecOrder = all
    .filter((r) => vectors.has(r.id))
    .map((r) => ({ id: r.id, s: cosine(queryVec, vectors.get(r.id)!) }))
    .sort((a, b) => b.s - a.s);
  const vecRank = new Map(vecOrder.map((x, i) => [x.id, i]));

  return all
    .map((r) => {
      let score = 0;
      if (lexRank.has(r.id)) score += 1 / (k + lexRank.get(r.id)!);
      if (vecRank.has(r.id)) score += 1 / (k + vecRank.get(r.id)!);
      return { record: r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.record.when.localeCompare(a.record.when))
    .slice(0, limit);
}

/** Nearest records to a query embedding by cosine — vector "similar" matches for recall. */
export function vectorNeighbors(
  queryVec: number[],
  all: ExperienceRecord[],
  vectors: Map<string, number[]>,
  threshold = 0.75,
  limit = 10,
): Match[] {
  return all
    .filter((r) => vectors.has(r.id))
    .map((r) => ({ record: r, kind: "similar" as const, score: cosine(queryVec, vectors.get(r.id)!) }))
    .filter((m) => m.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

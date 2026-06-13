import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type Outcome = "success" | "failure" | "partial";

/** One recorded attempt: the 5W1H plus root cause, detailed result, and a resolution. */
export interface ExperienceRecord {
  id: string;
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

/** Where the ledger lives. Override with EXPERIENCE_LEDGER_PATH (e.g. a repo-local file). */
export function ledgerPath(): string {
  return process.env.EXPERIENCE_LEDGER_PATH || join(homedir(), ".experience-ledger", "ledger.jsonl");
}

const norm = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

export function fingerprint(what: string): string {
  return createHash("sha1").update(norm(what)).digest("hex").slice(0, 12);
}

export function newId(): string {
  return randomUUID();
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

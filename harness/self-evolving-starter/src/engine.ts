import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import type { Candidate, EngineConfig, EngineResult } from "./types.js";

/** Deterministic PRNG (mulberry32) so evolution runs are reproducible from `seed`. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let counter = 0;
const nextId = (): string => `c${(++counter).toString(36)}`;

/**
 * The self-evolving loop (Darwin-Gödel-Machine style):
 *   seed -> { propose a variant, evaluate it, accept only if it beats the champion on the
 *   HELD-OUT score, version + record it } -> repeat until a stop condition.
 *
 * Acceptance is on the held-out score (not the proxy) and a reward-hack guard rejects
 * "proxy up / true down" jumps — the two defenses against the failure mode that wrecks
 * naive self-improvement.
 */
export async function evolve<G>(cfg: EngineConfig<G>): Promise<EngineResult<G>> {
  const rand = makeRng(cfg.seed ?? 1);
  const dir = cfg.archiveDir;
  if (dir) mkdirSync(dir, { recursive: true });
  const record = (rec: Record<string, unknown>): void => {
    if (dir) appendFileSync(join(dir, "evolution.jsonl"), JSON.stringify(rec) + "\n");
  };
  const version = (c: Candidate<G>): void => {
    if (dir) writeFileSync(join(dir, `gen-${c.generation}-${c.id}.json`), JSON.stringify(c, null, 2));
  };

  const seedScore = await Promise.resolve(cfg.evaluate(cfg.seedGenome));
  const seed: Candidate<G> = { id: nextId(), parentId: null, generation: 0, genome: cfg.seedGenome, score: seedScore };
  const archive: Candidate<G>[] = [seed];
  let best = seed;
  let accepted = 0;
  let rejected = 0;
  let hacksRejected = 0;
  let sinceImprove = 0;
  version(seed);
  record({ event: "seed", id: seed.id, score: seed.score });

  const hackDelta = cfg.hackGuardDelta ?? Infinity;
  let stopReason = "maxGenerations";
  let generations = cfg.maxGenerations;

  for (let gen = 1; gen <= cfg.maxGenerations; gen++) {
    const parent = best;
    const genome = await Promise.resolve(cfg.propose(parent, rand));
    const score = await Promise.resolve(cfg.evaluate(genome));
    const child: Candidate<G> = { id: nextId(), parentId: parent.id, generation: gen, genome, score };
    archive.push(child);

    const suspectedHack = score.train > best.score.train && best.score.holdout - score.holdout > hackDelta;
    let decision: string;
    if (suspectedHack) {
      hacksRejected++;
      rejected++;
      decision = "rejected:suspected-reward-hack";
    } else if (score.holdout > best.score.holdout) {
      best = child;
      accepted++;
      sinceImprove = 0;
      version(child);
      decision = "accepted";
    } else {
      rejected++;
      sinceImprove++;
      decision = "rejected:no-holdout-gain";
    }
    record({ event: "gen", gen, id: child.id, parentId: parent.id, score, decision, bestHoldout: best.score.holdout });

    if (cfg.targetHoldout !== undefined && best.score.holdout >= cfg.targetHoldout) {
      stopReason = "target";
      generations = gen;
      break;
    }
    if (cfg.patience !== undefined && sinceImprove >= cfg.patience) {
      stopReason = "patience";
      generations = gen;
      break;
    }
  }

  record({ event: "stop", reason: stopReason, generations, bestHoldout: best.score.holdout });
  return { best, generations, accepted, rejected, hacksRejected, archive };
}

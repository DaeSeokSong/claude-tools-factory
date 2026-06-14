#!/usr/bin/env node
// Self-verifying demo: proves the engine actually (1) improves a held-out fitness,
// (2) versions + logs the archive, (3) stops on a target, and (4) rejects a reward hack.
// Runs fully offline and deterministically (no model/API needed), so it doubles as a smoke test.
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evolve } from "./engine.js";
import type { Evaluator, Proposer } from "./types.js";

// --- A toy "scaffolding genome": a parameter vector to optimize toward a target ---
type Vec = number[];
const TARGET: Vec = [0.8, 0.2, 0.5, 0.9, 0.1, 0.6];
const TARGET_HOLDOUT: Vec = TARGET.map((v) => Math.min(1, v + 0.02)); // correlated, not identical
const sq = (a: Vec, b: Vec): number => a.reduce((s, x, i) => s + (x - (b[i] ?? 0)) ** 2, 0);
const evalVec: Evaluator<Vec> = (g) => ({ train: -sq(g, TARGET), holdout: -sq(g, TARGET_HOLDOUT) });
const mutate: Proposer<Vec> = (parent, rng) =>
  parent.genome.map((v) => Math.max(0, Math.min(1, v + (rng() - 0.5) * 0.2)));

// --- A genome that carries its own scores, for the reward-hack guard test ---
type Scored = { train: number; holdout: number };
const evalScored: Evaluator<Scored> = (g) => ({ train: g.train, holdout: g.holdout });

async function main(): Promise<void> {
  let fail = 0;
  const check = (name: string, ok: boolean): void => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
    if (!ok) fail++;
  };

  // Scenario A — real optimization: held-out fitness improves; archive + log written.
  const dir = join(tmpdir(), `seh-${Date.now()}`);
  const seed: Vec = [0, 0, 0, 0, 0, 0];
  const seedHoldout = -sq(seed, TARGET_HOLDOUT);
  const a = await evolve<Vec>({
    seedGenome: seed,
    propose: mutate,
    evaluate: evalVec,
    maxGenerations: 300,
    patience: 80,
    seed: 11,
    archiveDir: dir,
  });
  console.log(
    `  optimize: holdout ${seedHoldout.toFixed(3)} -> ${a.best.score.holdout.toFixed(3)} | ` +
      `${a.generations} gens | accepted ${a.accepted} rejected ${a.rejected}`,
  );
  check("A1 held-out fitness improved", a.best.score.holdout > seedHoldout + 0.5);
  check("A2 at least one champion accepted", a.accepted >= 1);
  check("A3 monotonic champion (holdout never regressed)", a.best.score.holdout >= seedHoldout);
  check("A4 evolution log written", existsSync(join(dir, "evolution.jsonl")));
  check("A5 champion genome versioned", existsSync(join(dir, `gen-${a.best.generation}-${a.best.id}.json`)));

  // Scenario A' — the target-holdout stop fires before maxGenerations.
  const a2 = await evolve<Vec>({
    seedGenome: seed,
    propose: mutate,
    evaluate: evalVec,
    maxGenerations: 500,
    targetHoldout: -0.5,
    seed: 11,
  });
  check("A6 target-holdout stop ends early", a2.generations < 500 && a2.best.score.holdout >= -0.5);

  // Scenario B — reward-hack guard: a proposal with higher proxy but much worse held-out
  // score must be rejected and never adopted.
  const b = await evolve<Scored>({
    seedGenome: { train: 0, holdout: 10 },
    propose: () => ({ train: 5, holdout: 2 }), // proxy up, true score down
    evaluate: evalScored,
    maxGenerations: 3,
    hackGuardDelta: 1,
    seed: 1,
  });
  check("B1 suspected reward-hack rejected", b.hacksRejected >= 1);
  check("B2 reward-hack NOT adopted as champion", b.best.score.holdout === 10);

  console.log(fail === 0 ? "\nALL CHECKS PASSED" : `\n${fail} CHECK(S) FAILED`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

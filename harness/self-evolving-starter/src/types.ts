// Core types for the self-evolving harness.
//
// A "genome" is whatever scaffolding you are evolving: a system prompt, a tool set,
// a control-flow config, a parameter vector — anything serializable. The engine is
// generic over it.

export interface EvalResult {
  /** Held-out / validation fitness. Acceptance is decided on THIS. Higher is better. */
  holdout: number;
  /** Cheaper proxy fitness used to guide proposals and to detect reward hacking. Higher is better. */
  train: number;
  notes?: string;
}

export interface Candidate<G> {
  id: string;
  parentId: string | null;
  generation: number;
  genome: G;
  score: EvalResult;
}

/** Produces a child genome from a parent. An LLM in real use; a mutator in the demo. */
export type Proposer<G> = (parent: Candidate<G>, rng: () => number) => Promise<G> | G;

/** Scores a genome on train + holdout. The user's task eval in real use; a toy fn in the demo. */
export type Evaluator<G> = (genome: G) => Promise<EvalResult> | EvalResult;

export interface EngineConfig<G> {
  seedGenome: G;
  propose: Proposer<G>;
  evaluate: Evaluator<G>;
  /** Hard cap on generations. */
  maxGenerations: number;
  /** Stop once the champion's holdout score reaches this. */
  targetHoldout?: number;
  /** Stop after this many generations with no holdout improvement. */
  patience?: number;
  /** If set, version every accepted champion and append a JSONL log here. */
  archiveDir?: string;
  /** RNG seed for reproducible runs. */
  seed?: number;
  /**
   * Reward-hack guard: reject a child if its train score rose but its holdout score
   * fell by more than this much vs the champion (a classic proxy-up / true-down hack).
   * Default: Infinity (guard off).
   */
  hackGuardDelta?: number;
}

export interface EngineResult<G> {
  best: Candidate<G>;
  generations: number;
  accepted: number;
  rejected: number;
  hacksRejected: number;
  archive: Candidate<G>[];
}

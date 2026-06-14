// Example adapters that turn the toy demo into a REAL self-evolving harness.
// These are wired for the common case: the genome is the scaffolding text (a system
// prompt / config), a model proposes improvements, and your eval scripts score it.
// They are intentionally small and dependency-free; adapt them to your stack.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import type { Evaluator, Proposer } from "./types.js";

/**
 * An Evaluator that writes the candidate scaffolding to `file`, runs a TRAIN command and a
 * separate HELD-OUT command, and parses a numeric score from each command's stdout.
 *
 * Keep train and holdout genuinely separate (different data / seeds / cases) — that split is
 * what the engine's acceptance and reward-hack guard rely on.
 */
export function commandEvaluator(opts: {
  file: string;
  trainCmd: string;
  holdoutCmd: string;
  scoreRegex?: RegExp;
}): Evaluator<string> {
  const re = opts.scoreRegex ?? /SCORE=([-\d.]+)/;
  const run = (cmd: string): number => {
    const out = execFileSync("bash", ["-lc", cmd], { encoding: "utf8" });
    const m = out.match(re);
    if (!m) throw new Error(`commandEvaluator: no ${re} in output of: ${cmd}`);
    return Number(m[1]);
  };
  return (genome: string) => {
    writeFileSync(opts.file, genome);
    return { train: run(opts.trainCmd), holdout: run(opts.holdoutCmd) };
  };
}

/**
 * A Proposer that asks a model (via the `claude` CLI in headless mode) to improve the parent
 * scaffolding. Swap the command for your own model call / the Anthropic SDK as needed.
 */
export function llmProposer(opts: { task: string; model?: string }): Proposer<string> {
  return (parent) => {
    const prompt = [
      "You are improving the scaffolding/harness for this task:",
      opts.task,
      "",
      "Current scaffolding:",
      "<<<",
      parent.genome,
      ">>>",
      "",
      "Propose ONE focused improvement. Output ONLY the full new scaffolding, nothing else.",
    ].join("\n");
    const args = ["-p", prompt, ...(opts.model ? ["--model", opts.model] : [])];
    return execFileSync("claude", args, { encoding: "utf8" }).trim();
  };
}

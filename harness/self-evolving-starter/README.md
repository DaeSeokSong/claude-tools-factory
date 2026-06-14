# self-evolving-harness-starter

A minimal, **honest** self-evolving harness — and an easy on-ramp to harness engineering.

The hard, valuable part of an agent isn't the model; it's the **harness** (the scaffolding around it: prompts, tools, control flow, memory, eval). Self-evolving systems like the [Darwin-Gödel Machine](https://arxiv.org/abs/2505.22954) improve their own scaffolding by **proposing a change, validating it against an eval, and keeping it only if it actually helps**. This starter gives you that loop in ~200 lines so you can plug in a task + an eval and start evolving.

## The loop

```
seed scaffolding
  └─► propose a variant ─► evaluate (train + held-out) ─► accept ONLY if held-out improves
        ▲                                                   │  └─ reward-hack guard: reject "proxy up / true down"
        └──────────────── version it (git) + record it ◄───┘  └─ else keep the champion
  repeat until: target reached · no improvement (patience) · max generations
```

Two defenses are built in, because they are exactly what wrecks naive self-improvement:

- **Acceptance is on a HELD-OUT score**, never the proxy the proposer optimizes. (Research finds ~74% of self-"optimizations" are proxy gains with no real gain.)
- **Reward-hack guard**: a child whose proxy rose but whose held-out score dropped past a threshold is rejected as a suspected hack (the `sys.exit(0)`-fakes-the-tests failure mode).

## Run the demo (also the smoke test)

```shell
npm install && npm run build && npm run demo
```

The demo is deterministic and offline (no model/API). It proves the engine improves a held-out fitness, versions + logs the archive, stops on a target, and rejects a reward hack — printing `ALL CHECKS PASSED`.

## Make it real

Bring two things and call `evolve()` (see `src/engine.ts`):

- a **genome** = your scaffolding (a system prompt, tool list, config, …), and
- an **evaluator** + a **proposer**. `src/adapters.ts` ships examples:
  - `commandEvaluator({ file, trainCmd, holdoutCmd })` — writes the candidate to a file, runs your train/held-out eval commands, parses a score.
  - `llmProposer({ task })` — asks a model (via the `claude` CLI) to improve the parent scaffolding.

```ts
import { evolve } from "./engine.js";
import { commandEvaluator, llmProposer } from "./adapters.js";

const result = await evolve<string>({
  seedGenome: initialSystemPrompt,
  propose: llmProposer({ task: "resolve GitHub issues in repo X" }),
  evaluate: commandEvaluator({ file: "./candidate.txt", trainCmd: "npm run eval:train", holdoutCmd: "npm run eval:holdout" }),
  maxGenerations: 30,
  patience: 8,
  hackGuardDelta: 0.1,
  archiveDir: "./.evolve",
});
```

## Pairs with this repo

- **experience-ledger** (MCP, `mcp/` track) — its archive of what worked/failed is the evolutionary memory; record each generation so dead-end mutations are not re-tried.
- **git** — every accepted champion is a versioned artifact (`archiveDir` + commit) you can review, diff, and roll back.

## Honest limits

- **Only as good as your eval.** Self-improvement is reliable only in **verifiable** domains (code, math — clean pass/fail). With a fuzzy "better" signal it reward-hacks or oscillates. The eval is the work; this loop is the easy part.
- A meta/evolved harness often does **not** beat a carefully hand-built one; treat it as search over scaffolds, not magic.
- **Safety:** run candidates in a sandbox, keep a human gate on adopted changes, and version everything. It will not invent capability beyond what the base model + search can reach.

## License

MIT

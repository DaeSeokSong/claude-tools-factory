# benchmark-leaderboards-mcp

An MCP server that answers a deceptively hard question: **"For this AI/ML benchmark, where is the authoritative leaderboard — and can I trust it?"**

There is no single live API that covers every benchmark. The closest thing, **Papers With Code, was sunset by Meta on 2025-07-25** and now exists only as a static GitHub archive. So leaderboards are scattered: some **official** (SWE-bench, COCO, MTEB, MMMU), some **community-standard** (EvalPlus, MathArena, Open LLM Leaderboard), some **archived** (the old PwC SOTA tables), and some genuinely **fragmented** (CIFAR-10 — no official board, several unrelated Kaggle pages and blog tables).

This server encodes that landscape as a curated registry and exposes it over MCP, so any agent can resolve a dataset name to the right source **with an authority label** — instead of guessing which of five pages is the real one.

## Tools

| Tool | Purpose |
| --- | --- |
| `find_leaderboard(dataset)` | Canonical leaderboard + authority level + non-canonical alternatives (and why to be wary) + metric/task + gotchas. |
| `get_leaderboard(dataset)` | Concise: just the single canonical source to fetch current standings from. |
| `list_benchmarks({query?, modality?, authority?})` | Browse / search the registry. |

**Authority levels:** `official` (run by the benchmark's maintainers) · `community-standard` (no official board, but one trusted maintained source) · `archived` (de-facto standard, no longer updated) · `fragmented` (no single trustworthy source).

### Division of labour
This server resolves **which source is authoritative**; it does **not** serve live numbers. It hands the agent a vetted URL, and the agent fetches the current standings with its own web tool. That keeps the server dependency-light and robust to the constant churn (and disappearance) of leaderboard sites.

## Install

```shell
# build from source
npm install && npm run build

# register with Claude Code by absolute path
claude mcp add benchmark-leaderboards -- node /abs/path/to/mcp/benchmark-leaderboards/dist/index.js
```

Once published to npm:

```shell
claude mcp add benchmark-leaderboards -- npx -y benchmark-leaderboards-mcp
```

Works with **any** MCP client (Claude Code, Cursor, …), not just Claude Code.

## Coverage

v0.1 ships **22 high-value benchmarks** across vision, language/LLM, code, embedding, and multimodal. Adding one is a single entry in [`src/registry.ts`](src/registry.ts) — no code changes.

Example (`find_leaderboard("cifar10")`): tells you there is **no official** CIFAR-10 leaderboard, that PwC (now archived) was the de-facto standard, that RobustBench only covers robustness, that Kaggle is fragmented, and warns that SOTA claims differ on preprocessing/augmentation/extra data.

## Roadmap

- Optional server-side **live adapters** (HF datasets-server, official JSON endpoints) behind a `live` flag, with graceful fallback to the registry pointer.
- Broaden registry coverage — community contributions are one registry entry each.

## License

MIT

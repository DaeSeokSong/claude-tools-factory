# experience-ledger-mcp

An MCP server that gives an agent a **persistent memory of what it has already tried** — so the same actions aren't re-attempted (and re-failed) over and over, and hard-won successes get reused.

**The problem it solves:** across sessions you (and the agent) forget which approaches failed and which worked, so the agent burns time repeating a known dead-end or rediscovering a known fix. This server records each attempt as a structured entry — **a one-line title + 5W1H (who / what / when / where / why / how) + root cause + detailed result + resolution** — and lets the agent *research prior experience before acting*.

## Workflow

1. **Before** a non-trivial task → **`research_task({ task })`**. It RAG-retrieves the most relevant prior experiences and reconstructs each action's causal chain (DAG), returning a pre-task brief:
   - **REUSE** — known-good approach to repeat.
   - **AVOID / FIX** — a failure with a recorded resolution; apply the fix, don't repeat the dead-end.
   - **UNRESOLVED** — a failure with no known fix; investigate it first.

   Cross-verify the brief still holds, then act. For one specific, previously-tried action, **`recall_experience({ what })`** gives a tighter match.
2. **After** the task — and after the research itself — → **`record_experience(...)`** with a `title`, the 5W1H, `outcome`, `rootCause`, `result`, and (on failure) a `resolution`. Tag research entries with `research`. Always record failures with a root cause + resolution; that single record is what prevents the next repeat.

## Tools

| Tool | When | Purpose |
| --- | --- | --- |
| `research_task(task, limit?)` | **before** a task | RAG retrieval + causal-chain (DAG) brief: REUSE / AVOID+fix / UNRESOLVED |
| `recall_experience(what)` | before a specific action | prior attempts at the same/similar action + outcome, cause, fix |
| `record_experience(...)` | **after** acting | log a one-line `title` + 5W1H + root cause + result + resolution |
| `list_experiences(query?, outcome?, tag?, date?, limit?)` | anytime | browse / search, incl. by single day (`date: YYYY-MM-DD`) |
| `experience_stats()` | anytime | per-day digest of one-line titles + repetition hotspots + embedding coverage |
| `embed_backfill()` | after enabling embeddings | compute + cache vectors for existing records (enables semantic retrieval) |

**Retrieval** works with zero configuration and zero dependencies: a normalized fingerprint of `what` (exact repeats) plus token-overlap relevance for near-duplicates. The **"DAG"** is the chronological chain of attempts that share a fingerprint, with the resolution that worked surfaced first. Optionally, **semantic (vector) retrieval** can be enabled (see below) and is then fused with the lexical signal, so a paraphrase with no shared words is still found.

## Storage

Append-only **JSONL**, one record per line. The ledger path resolves in priority order:
1. `EXPERIENCE_LEDGER_PATH` (explicit override), else
2. `$CLAUDE_PROJECT_DIR/.experience-ledger.jsonl` — Claude Code sets `CLAUDE_PROJECT_DIR` in the server's environment, so a repo's committed ledger is picked up **automatically**, with no path config, else
3. the nearest `.experience-ledger.jsonl` found by walking up from the working directory (covers other MCP clients / CLI use), else
4. `~/.experience-ledger/ledger.jsonl` (personal, cross-project).

A committed `.experience-ledger.jsonl` at the repo root gives a **project-scoped, version-controllable, team-shared** history. The format is human-readable and diff-friendly, and the log is immutable (every attempt is appended — repeated attempts are the signal, not noise). Corrupt lines are skipped rather than failing a read.

**Dogfooded in this repo** — the factory keeps its own committed ledger at [`.experience-ledger.jsonl`](../../.experience-ledger.jsonl) (repo root), seeded with the real lessons from building it: the `git push` deadlock and its MCP-API fix, the tool-call over-escaping trap, the YAML colon-space frontmatter bug, the held-out-eval rule for self-evolution, and more. Point `EXPERIENCE_LEDGER_PATH` at it (or install the `experience-guard` plugin) and `research_task` / `recall_experience` have real prior experience to draw on from the first call.

## Semantic (vector) retrieval (optional)

By default retrieval is lexical (no network, no API keys). To also match on *meaning* — so a query finds a relevant record even with no shared keywords — enable an embedding provider:

```shell
# Voyage AI (recommended for Anthropic stacks)
export EXPERIENCE_LEDGER_EMBED=voyage   VOYAGE_API_KEY=...
# or OpenAI
export EXPERIENCE_LEDGER_EMBED=openai   OPENAI_API_KEY=...
# or a deterministic, offline, dependency-free local embedder (no network; weaker than a trained model)
export EXPERIENCE_LEDGER_EMBED=hash
```

- New records are embedded automatically on `record_experience`. Run **`embed_backfill`** once to embed records that predate enabling it (e.g. the seeded ledger).
- Retrieval becomes **hybrid**: the lexical and vector rankings are fused with Reciprocal Rank Fusion, so you keep exact-keyword precision *and* gain semantic recall. With no provider set, it stays purely lexical (the default).
- Vectors are cached in a sidecar `*.vec.jsonl` next to the ledger (gitignored, regenerable), so the human-readable ledger stays clean. `EXPERIENCE_LEDGER_EMBED_MODEL` overrides the model.

## Install

```shell
npm install && npm run build

# personal, cross-project ledger:
claude mcp add experience-ledger -- node /abs/path/to/mcp/experience-ledger/dist/index.js

# project-scoped, committable ledger:
claude mcp add experience-ledger -e EXPERIENCE_LEDGER_PATH="$PWD/.experience-ledger.jsonl" -- node /abs/path/to/dist/index.js
```

Once published to npm: `claude mcp add experience-ledger -- npx -y experience-ledger-mcp`. Works with any MCP client (Claude Code, Cursor, …).

**In this repo**, a project-scoped [`.mcp.json`](../../.mcp.json) already registers this server, so you only build it once (`cd mcp/experience-ledger && npm install && npm run build`) and approve the server when Claude Code prompts — the committed root ledger is then used automatically (via `CLAUDE_PROJECT_DIR`).

## Make prevention automatic (recommended)

This server provides the *capability*; an agent still has to call it. Pair it with the **`experience-guard` plugin** (in this repo's `plugin/` track) — a skill + SessionStart hook that says "call `research_task` before non-trivial tasks and `record_experience` after" — so prevention happens without being asked.

## License

MIT

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
| `experience_stats()` | anytime | per-day digest of one-line titles + repetition hotspots |

**Retrieval** is dependency-free and lexical: a normalized fingerprint of `what` (exact repeats) plus token-overlap relevance for near-duplicates. The **"DAG"** is the chronological chain of attempts that share a fingerprint, with the resolution that worked surfaced first. A vector-embedding RAG backend is a future upgrade.

## Storage

Append-only **JSONL**, one record per line. Path resolution:
1. `EXPERIENCE_LEDGER_PATH` env var, else
2. `~/.experience-ledger/ledger.jsonl` (personal, cross-project).

Point `EXPERIENCE_LEDGER_PATH` at a file inside a repo (e.g. `./.experience-ledger.jsonl`) to keep a **project-scoped, version-controllable, team-shared** history. The format is human-readable and diff-friendly, and the log is immutable (every attempt is appended — repeated attempts are the signal, not noise). Corrupt lines are skipped rather than failing a read.

## Install

```shell
npm install && npm run build

# personal, cross-project ledger:
claude mcp add experience-ledger -- node /abs/path/to/mcp/experience-ledger/dist/index.js

# project-scoped, committable ledger:
claude mcp add experience-ledger -e EXPERIENCE_LEDGER_PATH="$PWD/.experience-ledger.jsonl" -- node /abs/path/to/dist/index.js
```

Once published to npm: `claude mcp add experience-ledger -- npx -y experience-ledger-mcp`. Works with any MCP client (Claude Code, Cursor, …).

## Make prevention automatic (recommended)

This server provides the *capability*; an agent still has to call it. Pair it with the **`experience-guard` plugin** (in this repo's `plugin/` track) — a skill + SessionStart hook that says "call `research_task` before non-trivial tasks and `record_experience` after" — so prevention happens without being asked.

## License

MIT

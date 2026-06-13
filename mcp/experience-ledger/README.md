# experience-ledger-mcp

An MCP server that gives an agent a **persistent memory of what it has already tried** — so the same actions aren't re-attempted (and re-failed) over and over, and hard-won successes get reused.

**The problem it solves:** across sessions you (and the agent) forget which approaches failed and which worked, so the agent burns time repeating a known dead-end or rediscovering a known fix. This server records each attempt as a structured entry — **5W1H (who / what / when / where / why / how) + root cause + detailed result + resolution** — and lets the agent *recall prior outcomes before acting*.

## Workflow

1. **Before** a non-trivial / risky / previously-tried action → `recall_experience({ what })`.
   - Prior **failure** with a resolution → apply the fix, don't repeat the dead-end.
   - Prior **success** → reuse the known-good approach.
   - Nothing → proceed, then record.
2. **After** the action (especially on failure) → `record_experience({ what, outcome, result, rootCause, resolution, ... })`.

## Tools

| Tool | When | Purpose |
| --- | --- | --- |
| `recall_experience(what)` | **before** acting | prior attempts at the same/similar action + their outcome, cause, fix |
| `record_experience(...)` | **after** acting | log the attempt (5W1H + root cause + result + resolution) |
| `list_experiences(query?, outcome?, tag?, limit?)` | anytime | browse / search the ledger |
| `experience_stats()` | anytime | counts + repetition hotspots (what keeps getting re-attempted) |

Matching is by a normalized fingerprint of `what` (exact repeats) plus token-overlap similarity (≥ 0.6) for near-duplicates.

## Storage

Append-only **JSONL**, one record per line. Path resolution:
1. `EXPERIENCE_LEDGER_PATH` env var, else
2. `~/.experience-ledger/ledger.jsonl` (personal, cross-project).

Point `EXPERIENCE_LEDGER_PATH` at a file inside a repo (e.g. `./.experience-ledger.jsonl`) to keep a **project-scoped, version-controllable, team-shared** history. The format is human-readable and diff-friendly, and the log is immutable (every attempt is appended — repeated attempts are the signal, not noise).

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

This server provides the *capability*; an agent still has to call it. Pair it with a Claude Code **skill or hook** ("call `recall_experience` before non-trivial actions, and `record_experience` after failures") so prevention happens without being asked. A companion plugin under `plugin/` can ship that discipline.

## License

MIT

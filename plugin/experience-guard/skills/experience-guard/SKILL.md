---
description: Before any non-trivial task, research prior experience and cross-verify; after acting, record the outcome. Use whenever you are about to start, plan, or retry a task that could have been attempted before or might fail (builds, pushes, integrations, config, env setup, flaky or multi-step work). Requires the experience-ledger MCP server (research_task, recall_experience, record_experience).
---

# Experience guard

You have an **experience ledger** (the `experience-ledger` MCP server). Use it so you never repeat a known failure and always reuse a known-good approach.

## Before a non-trivial task

1. Call **`research_task({ task: "<what you are about to do>" })`**.
2. Read the pre-task brief:
   - **REUSE** — apply the known-good approach.
   - **AVOID / FIX** — do NOT repeat the dead-end; apply the recorded resolution.
   - **UNRESOLVED** — a past failure with no known fix; investigate it first.
3. **Cross-verify** the brief still holds before relying on it — sources, environments, and tools change. Confirm with a quick check (read the file, re-run the probe, fetch the current page) rather than trusting stale history blindly.
4. For one specific, previously-tried action you can also call **`recall_experience({ what })`** for a tighter match.

## After the task — and after the research itself

5. Call **`record_experience(...)`** with:
   - a one-line **`title`** (for dated digests / retrieval),
   - the **5W1H** (`who`, `what`, `where`, `why`, `how`),
   - **`outcome`** (`success` / `failure` / `partial`), **`rootCause`**, **`result`**, and on failure a **`resolution`**,
   - **`tags`** (tag the pre-task research itself with `research`).
6. **Always** record FAILURES with a root cause and a resolution — that single record is what prevents the next repeat.

## Scope

- Use for: starting / planning / retrying anything that could have been tried before or might fail.
- Skip for: trivial, read-only, one-off actions.

If the `experience-ledger` tools are not available, tell the user to add the MCP server (see `mcp/experience-ledger` in this repo, or `npx -y experience-ledger-mcp`).

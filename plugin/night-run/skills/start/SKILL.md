---
description: Set up an overnight autonomous run before you sleep. Invoke as /night-run:start. It interviews you about the task, confirms its understanding, then works on its own — improve, try, record, commit — without asking, in one of two stop modes — Timed (run until a set time) or Until-stop (run until you say stop). Runs in THIS session, not a scheduled routine. Pairs with the experience-ledger MCP and git push.
disable-model-invocation: true
---

You are about to run unattended while the user sleeps. Follow these three phases in order.

## Phase 1 — Briefing (ask; do not assume)

Interview the user to capture a precise spec. Ask tight, grouped questions (use the AskUserQuestion tool where it helps) covering:

1. **Goal & definition of done** — what to work on, and what "done / good enough" means (concrete and checkable).
2. **Scope & no-go list** — where to focus; what must NOT be touched (e.g. no force-push, no deleting data, no production, no dependency upgrades).
3. **Stop mode — pick one:**
   - **(A) Timed** — run until a wall-clock time (e.g. 07:00) or for a duration (e.g. 6 hours), then stop.
   - **(B) Until-stop** — run with no time limit until the user sends a stop signal.

   In **both** modes these also end the run: any new user message (e.g. "stop", "일어났어"), the done-criteria being met, and a **max consecutive failures** safety cap (ask for it; default 5).
4. **Blocker policy** — when something genuinely needs a human: log-and-skip to the next item, or stop the run? (Default: log it, skip, continue; stop only on a critical or destructive blocker.)
5. **Verification** — how each change is tried/tested (build, tests, smoke) before it counts as progress.
6. **Morning report** — what the summary should contain.

## Phase 2 — Confirm (read it back)

Summarize the captured spec as a short checklist — **including the chosen stop mode and its stop time / "until I say stop"** — and ask for **explicit confirmation** (e.g. "이해한 게 맞나요? 시작할까요?"). Write the confirmed spec to `night-run-plan.md` in the working directory. **Do not start** until the user confirms (e.g. "맞아, 시작" / "good night").

## Phase 3 — Autonomous run (no questions until a stop condition)

After confirmation, work on your own. Repeat this cycle until a stop condition is met:

1. **Research first** — if the experience-ledger tools exist, call `research_task` to avoid repeating known failures; otherwise re-read `night-run-plan.md` and recent commits.
2. Pick the **next smallest improvement** and implement it.
3. **Verify** it per the spec (build / tests / smoke).
4. **Record** the outcome (`record_experience`: 5W1H + result + resolution; tag it `night-run`).
5. **Commit and push** the progress, and append a one-line entry to `night-run-plan.md` — so nothing is lost when a turn or context limit is hit.

Honor the chosen **stop mode** on every cycle:
- **(A) Timed** — check the clock at the start of each cycle; at or past the stop time, end the run.
- **(B) Until-stop** — keep going; only a stop signal (or done-criteria / failure cap) ends it.

Rules while running:

- **Do not ask the user anything.** Decide, log the decision, and continue. Only the stop conditions end the run.
- Treat **any new user message** (e.g. "stop", "일어났어") as an immediate **stop signal**, in either mode.
- Stay strictly inside the briefed scope and no-go list. **Never run destructive commands.**
- Use `night-run-plan.md` plus git history as durable memory, so you can keep going even after the context is compacted.

## At stop

Write a **morning summary** (also to `night-run-summary.md`): the stop mode used and why the run ended, what was attempted, what succeeded ✅ and what failed ❌ (with root cause), what is left, and links to the commits/PR. Make it your final message.

> This runs in the current session, not a scheduled routine, so it covers **one long autonomous stretch** and pauses when the session's turn/context limits are reached or the task is done — which is why every cycle commits + pushes. Before sleeping the user must set a non-blocking permission mode (see the plugin README), or the run will stall on an approval prompt.

# night-run

Set up an **overnight autonomous run** before you sleep. You invoke it, it interviews you, confirms what it understood, then works **on its own** — improve → try → record → commit — without asking, until your chosen stop condition.

It runs **in your current session** (no scheduled routine, by design): you brief it and go to sleep, and it makes as much progress as it can in one long autonomous stretch, committing + pushing after every cycle so nothing is lost.

## Stop modes (pick one at briefing)

- **(A) Timed** — runs until a wall-clock time or for a duration you give, then stops.
- **(B) Until-stop** — runs with no time limit until you send a stop signal.

In **both** modes the run also ends on: any message from you (e.g. "stop", "일어났어"), the done-criteria being met, or a max-consecutive-failures safety cap.

## Use

```
/night-run:start
```

Answer the briefing questions (including which stop mode), confirm the read-back, then sleep. In the morning, read `night-run-summary.md` and the commit history. To stop early — in either mode — just send any message (e.g. "stop").

## Before you sleep: make it non-blocking

The run must not stall waiting on an approval prompt. Pick one:

- Start the session in **Auto mode**: `--permission-mode auto` (classifier-guarded auto-approval; research preview), or
- Pre-allow the commands you expect in `.claude/settings.json`:
  ```json
  { "permissions": { "allow": ["Bash(npm *)", "Bash(git *)"] } }
  ```
- (Only inside a disposable container/VM: a bypass mode. Never on a machine you care about.)

## Recommended pairing

- **experience-ledger** MCP (this repo's `mcp/` track): the run calls `research_task` before each step and `record_experience` after, so it never repeats a known failure overnight.
- A clean git remote, so each cycle's `commit + push` durably preserves progress.

## Honest limits

This is **in-session, not a Routine**. It cannot auto-restart itself after the session/turn ends, and (in Until-stop mode especially) it will not necessarily fill the entire night — it works until its stop condition, the task is done, or it hits a turn / context / usage limit, then pauses (progress is already committed). For self-restarting, cron-style all-night runs, use Routines instead (deliberately not used here). Rate and usage limits are shared with the rest of your Claude usage, so bound the scope.

## License

MIT

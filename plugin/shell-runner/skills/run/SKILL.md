---
description: Run a shell/terminal command verbatim and show its output. Invoke as /shell-runner:run <command> (e.g. /shell-runner:run npm test). A user-invoked shortcut for running a specific command; works on every Claude Code interface — desktop, mobile, and web — because it routes through the Bash tool instead of a native terminal.
disable-model-invocation: true
---

Run the shell command below **exactly as given**, using the Bash tool, and show its full output (stdout and stderr) **verbatim**. Add no commentary beyond a single short line if the command errors or is clearly destructive. If no command was provided after the skill name, ask the user what to run.

Command to run:

```
$ARGUMENTS
```

# shell-runner

A `/run`-style slash command that executes a shell command **verbatim** via the Bash tool and shows its output.

## Why

Claude Code has no direct "bash mode" — every command goes through Claude invoking the Bash tool. The **desktop** app has an integrated terminal you can type into, but **mobile and web do not**. This skill gives you a fast, one-line command shortcut that works on **every** interface (desktop, mobile, web), because it simply asks Claude to run the command.

It is a *shortcut, not a true bypass* — Claude still runs the command via its Bash tool.

## Use

```
/shell-runner:run npm test
/shell-runner:run git status
```

## Permission prompts

By default the command goes through the normal Bash permission prompt (one confirmation). To run frequent commands without prompts, allow them in `.claude/settings.json`:

```json
{ "permissions": { "allow": ["Bash(npm *)", "Bash(git status)"] } }
```

Or, accepting that it then runs arbitrary commands without asking, add `allowed-tools: Bash` to the skill's frontmatter. Only do this in an environment you control.

## Shorter `/run`

Plugin skills are namespaced (`/shell-runner:run`). For a bare `/run`, copy `skills/run/` into your project's `.claude/skills/` (or `~/.claude/skills/`) — standalone skills are not namespaced.

## License

MIT

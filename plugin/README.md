# plugin/ — Claude Code plugins

Each subfolder here is **one plugin**: a bundle of skills, subagents, hooks, slash commands, an optional `.mcp.json`, LSP/monitor configs, and so on. Plugins are distributed through the **marketplace** catalog at `/.claude-plugin/marketplace.json` and installed individually.

## Add a new plugin

1. Create `plugin/<your-plugin>/.claude-plugin/plugin.json`:
   ```json
   {
     "name": "your-plugin",
     "description": "What it does",
     "version": "0.1.0"
   }
   ```
2. Add components at the **plugin root** (not inside `.claude-plugin/`):

   | Directory / file | Purpose |
   | --- | --- |
   | `skills/<name>/SKILL.md` | model-invoked skills |
   | `agents/` | subagent definitions |
   | `hooks/hooks.json` | lifecycle event handlers |
   | `commands/` | slash commands (legacy flat files; prefer `skills/`) |
   | `.mcp.json` | MCP servers bundled with the plugin |
   | `.lsp.json` | language servers |
   | `monitors/monitors.json` | background monitors |
   | `bin/` | executables added to the Bash tool's PATH |

3. Register it in `/.claude-plugin/marketplace.json` by appending to `plugins`:
   ```json
   { "name": "your-plugin", "source": "./plugin/your-plugin", "description": "..." }
   ```

## Install (for users)

```shell
/plugin marketplace add DaeSeokSong/claude-tools-factory
/plugin install your-plugin@claude-tools-factory
```

Plugin skills are namespaced: `/your-plugin:skill-name`.

## Rules of thumb

- **Version per plugin.** Bump `version` in the plugin's `plugin.json` to ship updates. Omit it and the git commit SHA becomes the version (every commit counts as a new release).
- **Self-contained.** Installed plugins are copied to a cache — never reference files outside the plugin folder (`../shared`). Use a symlink or a published package for shared code.
- Add a `README.md` per plugin with usage.
- Validate locally with `claude plugin validate` and test with `claude --plugin-dir ./plugin/your-plugin` before publishing.

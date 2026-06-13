# mcp/ — standalone MCP servers

Each subfolder here is **one MCP server**, distributed as its **own package** (npm / pip / docker / remote URL) with its own version. Unlike plugins, these do **not** go through the Claude Code marketplace — which means they work in **any** MCP client (Claude Code, Cursor, …), the widest reach of any artifact in this repo.

## Add a new server

1. Create `mcp/<your-server>/` as a self-contained package:
   - Node: its own `package.json` with a `bin` entry
   - Python: its own `pyproject.toml`
2. Implement the server (tools / resources / prompts) against the MCP SDK.
3. Give it its own version and a `README.md`.

## Install (for users)

```shell
# from a registry
claude mcp add your-server -- npx -y @your-scope/your-server
```

…or add it to a project's `.mcp.json`.

## Rules of thumb

- **Self-contained leaf.** A consumer installs just this one package, so any shared dependency must be a *published* package — not a bare `../` path into a sibling folder.
- Version each server independently (e.g. tag `mcp/your-server@1.2.0`).
- Optional: a plugin under `plugin/` can bundle one of these via its `.mcp.json` for Claude-Code-only convenience, but keeping the server standalone here preserves cross-client reach.

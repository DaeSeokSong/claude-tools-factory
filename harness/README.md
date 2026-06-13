# harness/ — agent harnesses

Each subfolder here is a **standalone agent harness**: the loop/runtime that wraps a model into an actual agent (typically built on the Claude Agent SDK). A harness is the *host* that runs skills, MCP servers, and hooks — so it sits a layer below them and ships as its **own app/framework**, not as a plugin.

## Add a new harness

1. Create `harness/<your-harness>/` as a standalone project: its own `package.json` / `pyproject.toml`, an entry point, and a `README.md`.
2. Wire in whatever it needs — MCP servers from `mcp/`, agent/persona definitions, custom tools, eval and memory infrastructure.

## Rules of thumb

- Distributed on its own (npm package, container, or its own repo) with independent versioning.
- **Self-contained:** depend on siblings only via published packages, not bare relative paths.
- Document how to run it and which models/credentials it expects.

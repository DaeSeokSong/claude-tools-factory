# claude-tools-factory

A factory for building, versioning, and publicly distributing **everything that helps an agent** — Claude Code plugins (skills, subagents, hooks, slash commands), standalone MCP servers, and agent harnesses. Auxiliary pieces like memory conventions and eval infrastructure attach to whichever leaf needs them.

## First principles

1. **Simplify** — reduce each thing to its essence before building it.
2. **Subdivide** — break it into small, independent, single-purpose pieces.
3. **Automate** — once a piece is simple and well-scoped, make it run itself.

## Why this layout

"Things that help agents" split into a few distribution tracks. The monorepo is the *development* unit; every distributable *leaf* stays self-contained.

| Track | Folder | Distribution mechanism | Consumed by |
| --- | --- | --- | --- |
| **Plugins** | `plugin/` | Claude Code **marketplace** — `/.claude-plugin/marketplace.json` lists each plugin | Claude Code (`/plugin install <name>@claude-tools-factory`) |
| **MCP servers** | `mcp/` | **Package registry** — each server is its own npm / pip / docker / remote package | Any MCP client (Claude Code, Cursor, …) |
| **Harnesses** | `harness/` | Standalone app/framework — its own package or repo | Run directly |

A plugin *bundles* components (skills, agents, hooks, an `.mcp.json`, …) and ships through one marketplace catalog. An MCP server is a *standalone* package with the widest reach (works in any MCP client). A harness is the *host* that runs all of the above, so it sits a layer below and ships on its own.

## The one monorepo rule

Each distributed leaf must be **self-contained**. Installed plugins are copied to a cache, so a plugin cannot reference files outside its own directory (`../shared-utils` breaks). Share code via a published package or a symlink — never a bare relative path that escapes the leaf. The same applies to MCP servers and harnesses: a consumer installs just that one leaf.

Shared code therefore lives in **`packages/`** and is **bundled into each leaf at build** (e.g. the MCP servers esbuild-inline `social-core`), so a leaf reuses logic with no duplication yet still installs independently with nothing extra to publish.

## Layout

```
.
├── .claude-plugin/
│   └── marketplace.json   # catalog of every plugin under plugin/
├── packages/              # shared libraries (e.g. social-core), bundled into leaves at build
├── plugin/                # Claude Code plugins (one folder per plugin)
├── mcp/                   # standalone MCP servers (one folder per server)
└── harness/               # standalone agent harnesses (one folder per harness)
```

The folder tree is expected to evolve. See each track's README for how to add a new entry.

## Scratch space

Experiment in-repo without polluting the factory. `.scratch/` and `.evolve/` are gitignored, so throwaway tests, scratch builds, and harness archive output (e.g. `evolve({ archiveDir: ".evolve" })`) land there and never get committed — just delete the directory when you're done. For a fully isolated run, work under `/tmp` instead. Either way the committed leaves stay clean.

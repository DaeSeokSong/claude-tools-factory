# docs-rag-mcp

An MCP server that lets an agent **ground its answers in real documentation** instead of hallucinating APIs. Point it at a library's docs (local files/folders or URLs); it chunks and indexes them, and `search_docs` returns the most relevant passages **with citations** so the agent quotes the source rather than guessing.

**The problem it solves:** agents confidently invent function signatures, flags, and config keys that don't exist. Retrieval over the actual docs replaces that guess with a cited passage — and when nothing relevant is found, the agent is told to say so instead of making something up.

## Tools

| Tool | Purpose |
| --- | --- |
| `ingest_docs(paths?, urls?, collection?, exts?, maxChars?)` | Index local files/folders (recursive; `.md/.mdx/.markdown/.txt/.rst`) and/or URLs. Markdown is chunked by heading; re-ingesting is deduplicated. |
| `search_docs(query, k?, collection?)` | Retrieve the top-k relevant passages, each with its **source + heading** to cite. |
| `list_sources(collection?)` | Show collections, indexed sources + chunk counts, and embedding coverage. |
| `clear_docs(collection?)` | Delete one collection's index + vector cache (so it can be re-ingested). |

**Collections** keep separate corpora apart (e.g. `react`, `internal-api`). Default is `default`.

## Retrieval

Lexical by default (zero config, zero network): heading-aware chunking + token-overlap relevance. Turn on **semantic** retrieval and the two are fused with Reciprocal Rank Fusion, so a query is matched on meaning even with no shared keywords:

```shell
export DOCS_RAG_EMBED=voyage   VOYAGE_API_KEY=...   # or
export DOCS_RAG_EMBED=openai   OPENAI_API_KEY=...   # or, offline/no-network:
export DOCS_RAG_EMBED=hash
```

New chunks are embedded on `ingest_docs`; `DOCS_RAG_EMBED_MODEL` overrides the model. With no provider set it stays purely lexical.

## Storage

The index is a derived **cache** (regenerable from your docs), kept as append-only JSONL with a sidecar `*.vec.jsonl` for embeddings. Location:
1. `DOCS_RAG_DIR`, else
2. `$CLAUDE_PROJECT_DIR/.docs-rag/` (Claude Code sets `CLAUDE_PROJECT_DIR` in the server env), else
3. `<cwd>/.docs-rag/`.

`.docs-rag/` is gitignored in this repo — re-`ingest_docs` to rebuild it.

## Install

```shell
npm install && npm run build

claude mcp add docs-rag -- node /abs/path/to/mcp/docs-rag/dist/index.js
# semantic search:
claude mcp add docs-rag -e DOCS_RAG_EMBED=voyage -e VOYAGE_API_KEY=... -- node /abs/path/to/dist/index.js
```

Once published to npm: `claude mcp add docs-rag -- npx -y docs-rag-mcp`. Works with any MCP client (Claude Code, Cursor, …).

## Typical flow

1. `ingest_docs({ paths: ["./node_modules/some-lib/docs", "./README.md"] })` (or `urls: ["https://…"]`).
2. Before using an unfamiliar API → `search_docs({ query: "how to configure retries" })`.
3. Answer using the returned passages, citing their `source › heading`.

## License

MIT

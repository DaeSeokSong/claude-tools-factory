#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  appendChunks,
  appendVectors,
  baseDir,
  chunkBody,
  chunksFromText,
  clearCollection,
  DOC_EXTS,
  displaySource,
  fetchUrlText,
  indexPath,
  isMarkdown,
  listCollections,
  loadChunks,
  loadVectors,
  rankHybrid,
  walkFiles,
  type Chunk,
} from "./store.js";
import { embedderFromEnv } from "./embed.js";

const embedder = embedderFromEnv();

async function embedNew(chunks: Chunk[], collection?: string): Promise<{ embedded: number; failed: number }> {
  if (!embedder || !chunks.length) return { embedded: 0, failed: 0 };
  let embedded = 0;
  let failed = 0;
  const batchSize = 64;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    try {
      const vecs = await embedder.embed(batch.map(chunkBody));
      appendVectors(
        batch.map((c, j) => ({ id: c.id, e: vecs[j] })),
        collection,
      );
      embedded += batch.length;
    } catch (e) {
      failed += batch.length;
      console.error("embedding batch failed (chunks indexed without vectors):", e);
    }
  }
  return { embedded, failed };
}

const server = new McpServer({ name: "docs-rag", version: "0.1.0" });

server.registerTool(
  "ingest_docs",
  {
    title: "Ingest docs into a searchable index (files / folders / URLs)",
    description:
      "Index documentation so search_docs can ground answers in it. Give local `paths` (files or folders — folders are " +
      "walked recursively for .md/.mdx/.markdown/.txt/.rst) and/or `urls` (fetched and reduced to text). Markdown is chunked " +
      "by heading; other text by paragraph. Re-ingesting the same content is deduplicated. If an embedding provider is set " +
      "(DOCS_RAG_EMBED), new chunks are embedded for semantic search. Use a `collection` to keep separate corpora.",
    inputSchema: {
      paths: z.array(z.string()).optional().describe("Local file or directory paths to ingest."),
      urls: z.array(z.string()).optional().describe("URLs to fetch and ingest (best-effort HTML-to-text)."),
      collection: z.string().optional().describe("Named corpus (default 'default')."),
      exts: z.array(z.string()).optional().describe("Override file extensions for directory walks (e.g. ['.md', '.ts'])."),
      maxChars: z.number().int().positive().max(8000).optional().describe("Max characters per chunk (default 1500)."),
    },
  },
  async ({ paths, urls, collection, exts, maxChars }) => {
    if ((!paths || !paths.length) && (!urls || !urls.length)) {
      return { content: [{ type: "text", text: "Nothing to ingest: provide `paths` and/or `urls`." }] };
    }
    const existing = new Set(loadChunks(collection).map((c) => c.id));
    const fresh: Chunk[] = [];
    const seen = new Set<string>(existing);
    const errors: string[] = [];
    let fileCount = 0;
    let urlCount = 0;

    for (const p of paths ?? []) {
      const files = walkFiles(p, exts ?? DOC_EXTS);
      if (!files.length) errors.push(`no files under: ${p}`);
      for (const f of files) {
        try {
          const raw = readFileSync(f, "utf8");
          const made = chunksFromText(raw, {
            source: displaySource(f),
            sourceType: "file",
            collection: collection ?? "default",
            markdown: isMarkdown(f),
            maxChars,
          });
          let added = 0;
          for (const c of made)
            if (!seen.has(c.id)) {
              seen.add(c.id);
              fresh.push(c);
              added++;
            }
          if (added) fileCount++;
        } catch (e) {
          errors.push(`read ${f}: ${(e as Error).message}`);
        }
      }
    }

    for (const u of urls ?? []) {
      try {
        const raw = await fetchUrlText(u);
        const made = chunksFromText(raw, {
          source: u,
          sourceType: "url",
          collection: collection ?? "default",
          markdown: false,
          maxChars,
        });
        let added = 0;
        for (const c of made)
          if (!seen.has(c.id)) {
            seen.add(c.id);
            fresh.push(c);
            added++;
          }
        if (added) urlCount++;
      } catch (e) {
        errors.push(`fetch ${u}: ${(e as Error).message}`);
      }
    }

    appendChunks(fresh, collection);
    const emb = await embedNew(fresh, collection);
    const total = existing.size + fresh.length;

    const lines = [
      `Ingested into "${collection ?? "default"}": +${fresh.length} new chunk(s) from ${fileCount} file(s)` +
        (urlCount ? ` and ${urlCount} URL(s)` : "") +
        ` (deduped against ${existing.size} existing; ${total} total).`,
      `Index: ${indexPath(collection)}`,
    ];
    if (embedder) lines.push(`Embeddings: +${emb.embedded} via ${embedder.id}${emb.failed ? ` (${emb.failed} failed)` : ""}.`);
    else lines.push("Retrieval: lexical (set DOCS_RAG_EMBED=voyage|openai|hash for semantic search).");
    if (errors.length) lines.push("", `Skipped ${errors.length}:`, ...errors.slice(0, 10).map((e) => `  - ${e}`));
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

server.registerTool(
  "search_docs",
  {
    title: "Search indexed docs and return relevant passages WITH citations",
    description:
      "Retrieve the passages most relevant to a query from the indexed docs, each with its source and heading so you can " +
      "cite it. Uses lexical matching, fused with vector similarity when an embedding provider is configured. Ground your " +
      "answer in these passages instead of guessing; if nothing relevant is returned, say so rather than inventing an API.",
    inputSchema: {
      query: z.string().describe("What you want to know, in plain language."),
      k: z.number().int().positive().max(20).optional().describe("Number of passages to return (default 6)."),
      collection: z.string().optional().describe("Which corpus to search (default 'default')."),
    },
  },
  async ({ query, k, collection }) => {
    const chunks = loadChunks(collection);
    if (!chunks.length) {
      return {
        content: [
          {
            type: "text",
            text: `No docs indexed in "${collection ?? "default"}" yet (${indexPath(collection)}). Run ingest_docs first.`,
          },
        ],
      };
    }
    const vectors = embedder ? loadVectors(collection) : new Map<string, number[]>();
    let queryVec: number[] | null = null;
    if (embedder && vectors.size) {
      try {
        [queryVec] = await embedder.embed([query]);
      } catch (e) {
        console.error("query embedding failed; lexical only:", e);
      }
    }
    const hits = rankHybrid(query, chunks, queryVec, vectors, k ?? 6);
    if (!hits.length) {
      return {
        content: [
          { type: "text", text: `No indexed passage is relevant to "${query}". Say so rather than inventing an answer.` },
        ],
      };
    }
    const mode = queryVec ? `hybrid lexical+vector (${embedder!.id})` : "lexical";
    const out = [`${hits.length} passage(s) for: ${query}   [${mode}]`, ""];
    hits.forEach((h, i) => {
      const loc = h.chunk.heading ? `${h.chunk.source} › ${h.chunk.heading}` : h.chunk.source;
      out.push(`[${i + 1}] ${loc}`, h.chunk.text.trim(), "");
    });
    out.push("Cite the source(s) above. If they do not actually answer the question, say the docs do not cover it.");
    return { content: [{ type: "text", text: out.join("\n") }] };
  },
);

server.registerTool(
  "list_sources",
  {
    title: "List what is indexed (collections, sources, chunk counts, embedding coverage)",
    description: "Show which collections exist and, for one collection, the indexed sources with their chunk counts.",
    inputSchema: {
      collection: z.string().optional().describe("Collection to detail (default 'default')."),
    },
  },
  async ({ collection }) => {
    const collections = listCollections();
    const chunks = loadChunks(collection);
    const lines = [`Index dir: ${baseDir()}`, `Collections: ${collections.length ? collections.join(", ") : "(none)"}`, ""];
    if (!chunks.length) {
      lines.push(`Collection "${collection ?? "default"}" is empty. Run ingest_docs.`);
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
    const bySource = new Map<string, number>();
    for (const c of chunks) bySource.set(c.source, (bySource.get(c.source) ?? 0) + 1);
    const vectors = embedder ? loadVectors(collection) : new Map<string, number[]>();
    lines.push(`Collection "${collection ?? "default"}": ${chunks.length} chunk(s) from ${bySource.size} source(s).`);
    if (embedder || vectors.size) lines.push(`Embeddings: ${vectors.size}/${chunks.length} cached${embedder ? ` · ${embedder.id}` : ""}.`);
    lines.push("");
    for (const [src, n] of [...bySource.entries()].sort((a, b) => b[1] - a[1])) lines.push(`  ${n}×  ${src}`);
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

server.registerTool(
  "clear_docs",
  {
    title: "Clear a collection's index (and its embedding cache)",
    description: "Delete the index + vector cache for one collection so it can be re-ingested cleanly. Scoped to the derived cache.",
    inputSchema: {
      collection: z.string().optional().describe("Collection to clear (default 'default')."),
    },
  },
  async ({ collection }) => {
    const removed = clearCollection(collection);
    return {
      content: [
        {
          type: "text",
          text: removed.length
            ? `Cleared "${collection ?? "default"}":\n` + removed.map((p) => `  - ${p}`).join("\n")
            : `Nothing to clear for "${collection ?? "default"}".`,
        },
      ],
    };
  },
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  console.error(
    `docs-rag MCP server running on stdio (index dir: ${baseDir()}; ` +
      `retrieval: ${embedder ? "hybrid lexical+vector via " + embedder.id : "lexical"})`,
  );
}

main().catch((err) => {
  console.error("Fatal error starting docs-rag MCP server:", err);
  process.exit(1);
});

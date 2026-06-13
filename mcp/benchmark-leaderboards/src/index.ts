#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  REGISTRY,
  findBenchmark,
  searchBenchmarks,
  type Authority,
  type Benchmark,
  type Leaderboard,
} from "./registry.js";

const AUTHORITY_LABEL: Record<Authority, string> = {
  official: "✅ official (run by the benchmark's own maintainers)",
  "community-standard": "☑️ community-standard (no official board, but a widely-trusted maintained source)",
  archived: "🗄️ archived (de-facto standard, no longer live-updated)",
  fragmented: "⚠️ fragmented (no single trustworthy source; results are scattered)",
};

// Authorities that correspond to a maintained, live leaderboard you can actually read now.
const LIVE_AUTH: Authority[] = ["official", "community-standard"];

function renderLeaderboard(l: Leaderboard, bullet = false): string {
  const head = `${bullet ? "• " : ""}${l.name}`;
  const lines = [head, `   authority: ${AUTHORITY_LABEL[l.authority]}`, `   url: ${l.url}`];
  if (l.note) lines.push(`   note: ${l.note}`);
  return lines.join("\n");
}

function renderBenchmark(b: Benchmark): string {
  const out: string[] = [];
  out.push(`# ${b.name} — ${b.task} (${b.modality})`);
  out.push(`metric: ${b.metric}`);
  out.push("");
  out.push("Canonical leaderboard (look here first):");
  out.push(renderLeaderboard(b.canonical));
  if (b.alternatives?.length) {
    out.push("");
    out.push("Other sources (NOT canonical — know why before trusting):");
    for (const alt of b.alternatives) out.push(renderLeaderboard(alt, true));
  }
  if (b.notes) {
    out.push("");
    out.push(`⚠️ Notes: ${b.notes}`);
  }
  out.push("");
  if (LIVE_AUTH.includes(b.canonical.authority)) {
    out.push(
      "To read CURRENT standings, fetch the canonical URL above with your web tool — " +
        "this server vouches for WHICH source is authoritative, not for live numbers.",
    );
  } else {
    out.push(
      "⚠️ No single LIVE/official board exists — the canonical link is a historical/archived reference. " +
        "Use the alternatives above (mind their caveats) or recent papers for current numbers.",
    );
  }
  return out.join("\n");
}

function notFound(query: string): string {
  const sugg = searchBenchmarks(query).slice(0, 8);
  const lines = [`No registry entry matched "${query}".`];
  if (sugg.length) {
    lines.push("", "Closest known benchmarks:");
    for (const b of sugg) lines.push(`• ${b.id} — ${b.name} (${b.modality})`);
  } else {
    lines.push("", `The registry currently tracks ${REGISTRY.length} benchmarks. Use list_benchmarks to browse them.`);
  }
  lines.push(
    "",
    "If this benchmark should be covered, it is a one-entry addition to the curated registry (src/registry.ts).",
  );
  return lines.join("\n");
}

const server = new McpServer({ name: "benchmark-leaderboards", version: "0.1.0" });

server.registerTool(
  "find_leaderboard",
  {
    title: "Find the authoritative leaderboard for an AI/ML benchmark",
    description:
      "Given a benchmark dataset name (e.g. 'CIFAR-10', 'SWE-bench', 'MMLU'), return the canonical/authoritative leaderboard, " +
      "how trustworthy it is (official vs community-standard vs archived vs fragmented), other non-canonical sources and why " +
      "to be wary of them, the metric/task, and gotchas. Solves 'where do I even look, and is this the real one?'.",
    inputSchema: {
      dataset: z.string().describe("Benchmark/dataset name, e.g. 'cifar10', 'imagenet', 'swe-bench', 'chatbot arena'."),
    },
  },
  async ({ dataset }) => {
    const b = findBenchmark(dataset);
    return { content: [{ type: "text", text: b ? renderBenchmark(b) : notFound(dataset) }] };
  },
);

server.registerTool(
  "get_leaderboard",
  {
    title: "Get the canonical leaderboard pointer to read current standings",
    description:
      "Like find_leaderboard but concise: returns just the single canonical source (name, authority, URL, metric) for a " +
      "benchmark, so an agent can then fetch that URL for current rankings. For benchmarks with no live/official board " +
      "(archived or fragmented), it says so explicitly instead of pointing at a dead URL.",
    inputSchema: {
      dataset: z.string().describe("Benchmark/dataset name."),
    },
  },
  async ({ dataset }) => {
    const b = findBenchmark(dataset);
    if (!b) return { content: [{ type: "text", text: notFound(dataset) }] };
    // When the canonical source is archived/fragmented there is no clean live board to
    // point at, so fall back to the full breakdown (which states "no official board" and
    // lists alternatives) instead of misdirecting to a dead URL.
    if (!LIVE_AUTH.includes(b.canonical.authority)) {
      return { content: [{ type: "text", text: renderBenchmark(b) }] };
    }
    const text = [
      `${b.name} — ${b.task} (${b.modality}); metric: ${b.metric}`,
      "",
      renderLeaderboard(b.canonical),
      "",
      "Fetch that URL for the current ranking. (Live numbers are not served by this MCP — it resolves the authoritative source; your web tool reads it.)",
    ].join("\n");
    return { content: [{ type: "text", text }] };
  },
);

server.registerTool(
  "list_benchmarks",
  {
    title: "List / search the benchmark registry",
    description:
      "Browse or search the curated registry of benchmarks. Optionally filter by free-text query, modality, or authority " +
      "level of the canonical source.",
    inputSchema: {
      query: z.string().optional().describe("Free-text filter over id/name/task/aliases."),
      modality: z
        .enum(["vision", "language", "code", "multimodal", "embedding", "speech", "rl", "tabular"])
        .optional()
        .describe("Filter by modality."),
      authority: z
        .enum(["official", "community-standard", "archived", "fragmented"])
        .optional()
        .describe("Filter by the authority level of the canonical leaderboard."),
    },
  },
  async ({ query, modality, authority }) => {
    let results = query ? searchBenchmarks(query) : [...REGISTRY];
    if (modality) results = results.filter((b) => b.modality === modality);
    if (authority) results = results.filter((b) => b.canonical.authority === authority);
    if (!results.length) {
      return { content: [{ type: "text", text: "No benchmarks matched those filters." }] };
    }
    const lines = [
      `${results.length} benchmark(s):`,
      "",
      ...results.map(
        (b) => `• ${b.id} — ${b.name} | ${b.task} (${b.modality}) | canonical: ${b.canonical.authority}`,
      ),
    ];
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for logs; stdout is the MCP transport.
  console.error("benchmark-leaderboards MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting benchmark-leaderboards MCP server:", err);
  process.exit(1);
});

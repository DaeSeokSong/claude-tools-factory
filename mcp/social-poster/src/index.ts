#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { planFor } from "./segment.js";
import { PLATFORMS, PLATFORM_IDS, configuredPublishers, type PlatformId } from "./platforms.js";

function resolvePlatforms(requested: string[] | undefined, fallback: PlatformId[]): PlatformId[] {
  if (!requested || !requested.length) return fallback;
  const valid = requested.filter((p): p is PlatformId => p in PLATFORMS);
  return valid;
}

function renderPlan(text: string, ids: PlatformId[], number: boolean): string {
  const lines: string[] = [];
  for (const id of ids) {
    const meta = PLATFORMS[id];
    const plan = planFor(meta.name, meta.charLimit, text, number);
    const tag = plan.segments.length > 1 ? `thread of ${plan.segments.length}` : "single post";
    lines.push(`### ${meta.name} (limit ${meta.charLimit}) — ${tag}`);
    plan.segments.forEach((s, i) => lines.push(`  [${i + 1}/${plan.segments.length}] (${s.length} chars) ${s}`));
    if (!plan.withinLimit) lines.push("  ⚠️ a segment still exceeds the limit");
    lines.push("");
  }
  return lines.join("\n").trim();
}

const server = new McpServer({ name: "social-poster", version: "0.1.0" });

server.registerTool(
  "social_status",
  {
    title: "Show which social platforms are configured (no secrets revealed)",
    description:
      "List the supported platforms (X, Threads), their character limits, and whether credentials are present in the " +
      "environment so publishing would work. Reveals only booleans, never token values.",
    inputSchema: {},
  },
  async () => {
    const configured = configuredPublishers();
    const lines = ["Social platforms:"];
    for (const id of PLATFORM_IDS) {
      const meta = PLATFORMS[id];
      lines.push(`  ${id in configured ? "✅ configured" : "—  not configured"}  ${meta.name} (limit ${meta.charLimit})`);
    }
    lines.push(
      "",
      "Credentials (env): X needs X_ACCESS_TOKEN (OAuth2 user token, scope tweet.write). " +
        "Threads needs THREADS_ACCESS_TOKEN + THREADS_USER_ID.",
    );
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

server.registerTool(
  "preview_post",
  {
    title: "Preview how text will post to X / Threads (no network, posts NOTHING)",
    description:
      "Dry-run: show exactly what would be posted to each platform — the per-platform segmentation (auto-split into a " +
      "numbered thread when the text exceeds a platform's limit), each segment's character count, and any warnings. " +
      "Makes no network call and needs no credentials. Always preview before publish_post.",
    inputSchema: {
      text: z.string().describe("The post text. Long text is auto-split into a numbered thread per platform."),
      platforms: z.array(z.enum(["x", "threads"])).optional().describe("Target platforms (default: all)."),
      number: z.boolean().optional().describe("Append (i/n) counters when threading (default true)."),
    },
  },
  async ({ text, platforms, number }) => {
    const ids = resolvePlatforms(platforms, PLATFORM_IDS);
    if (!ids.length) return { content: [{ type: "text", text: "No valid platforms. Choose from: x, threads." }] };
    const body = renderPlan(text, ids, number ?? true);
    return {
      content: [
        {
          type: "text",
          text: `PREVIEW ONLY — nothing was posted.\n\n${body}\n\nTo actually publish, call publish_post with confirm: true.`,
        },
      ],
    };
  },
);

server.registerTool(
  "publish_post",
  {
    title: "Publish text to X / Threads (PUBLIC, IRREVERSIBLE — requires confirm: true)",
    description:
      "Actually post to the chosen platforms (auto-splitting long text into a numbered thread). This is PUBLIC and cannot " +
      "be undone, so it refuses unless confirm is true AND credentials are configured. Without confirm it returns the " +
      "preview instead. Best practice: run preview_post, show the user, get the user's go-ahead, then call this with " +
      "confirm: true. Returns the posted URLs (the first segment is the thread root).",
    inputSchema: {
      text: z.string().describe("The post text."),
      platforms: z.array(z.enum(["x", "threads"])).optional().describe("Targets (default: every configured platform)."),
      number: z.boolean().optional().describe("Append (i/n) counters when threading (default true)."),
      confirm: z.boolean().optional().describe("Must be true to actually post. Omitted/false returns a preview."),
    },
  },
  async ({ text, platforms, number, confirm }) => {
    const configured = configuredPublishers();
    const configuredIds = Object.keys(configured) as PlatformId[];

    if (!confirm) {
      const ids = resolvePlatforms(platforms, PLATFORM_IDS);
      const body = ids.length ? renderPlan(text, ids, number ?? true) : "No valid platforms.";
      return {
        content: [
          {
            type: "text",
            text: `NOT PUBLISHED (confirm was not true). Preview:\n\n${body}\n\nRe-call with confirm: true to post for real.`,
          },
        ],
      };
    }

    const ids = resolvePlatforms(platforms, configuredIds);
    if (!ids.length) {
      return {
        content: [
          {
            type: "text",
            text: "No configured platform to publish to. Set X_ACCESS_TOKEN and/or THREADS_ACCESS_TOKEN + THREADS_USER_ID, then retry.",
          },
        ],
      };
    }

    const out: string[] = [];
    for (const id of ids) {
      const meta = PLATFORMS[id];
      const pub = configured[id];
      if (!pub) {
        out.push(`### ${meta.name}: ❌ not configured (missing credentials) — skipped`);
        continue;
      }
      const plan = planFor(meta.name, meta.charLimit, text, number ?? true);
      const results = await pub.publish(plan.segments);
      const okCount = results.filter((r) => r.ok).length;
      const root = results.find((r) => r.ok && r.url)?.url;
      out.push(`### ${meta.name}: ${okCount}/${plan.segments.length} segment(s) posted${root ? ` — ${root}` : ""}`);
      for (const r of results.filter((x) => !x.ok)) out.push(`  ❌ segment ${r.segment}: ${r.error}`);
    }
    return { content: [{ type: "text", text: `Publish complete.\n\n${out.join("\n")}` }] };
  },
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  const configured = Object.keys(configuredPublishers());
  console.error(
    `social-poster MCP server running on stdio (configured: ${configured.length ? configured.join(", ") : "none — preview only"})`,
  );
}

main().catch((err) => {
  console.error("Fatal error starting social-poster MCP server:", err);
  process.exit(1);
});

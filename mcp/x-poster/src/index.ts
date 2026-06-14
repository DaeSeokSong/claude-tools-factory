#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { splitThread, lintHashtags, xWeight } from "./segment.js";
import { X_CHAR_LIMIT, buildXPublisher, isXConfigured } from "./x.js";

const REACH_TIPS =
  "Reach tips: X ranks by first-~30-min engagement (replies count far more than likes), author authority, and recency — " +
  "not hashtags. Lead with a strong first line, invite replies, keep hashtags to 0–2 niche tags. To target a topical " +
  "audience inside one account, post into an X Community via communityId.";

function renderPlan(text: string, number: boolean, communityId?: string): string {
  const segments = splitThread(text, X_CHAR_LIMIT, number);
  const lint = lintHashtags(text);
  const head = segments.length > 1 ? `thread of ${segments.length}` : "single post";
  const lines = [`X (Twitter) — ${head}${communityId ? ` → Community ${communityId}` : ""}`];
  segments.forEach((s, i) => lines.push(`  [${i + 1}/${segments.length}] (${xWeight(s)}/${X_CHAR_LIMIT}) ${s}`));
  lines.push("", `Hashtags: ${lint.note}${lint.warn ? "  ⚠️" : ""}`);
  return lines.join("\n");
}

const server = new McpServer({ name: "x-poster", version: "0.1.1" });

server.registerTool(
  "x_status",
  {
    title: "Show X posting configuration (no secrets revealed)",
    description:
      "Report whether an X token is present (so publishing would work), the character limit, and that posting into an X " +
      "Community (communityId) is supported. Reveals only a boolean, never the token value.",
    inputSchema: {},
  },
  async () => {
    const lines = [
      `X poster: ${isXConfigured() ? "✅ configured (token present)" : "—  not configured"}`,
      `Character limit: ${X_CHAR_LIMIT} (long text auto-splits into a numbered reply thread)`,
      "Community routing: supported via communityId (posts the thread root into that X Community)",
      "Credentials (env): X_ACCESS_TOKEN — OAuth 2.0 user-context token with scope tweet.write.",
      "",
      REACH_TIPS,
    ];
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

server.registerTool(
  "preview_x_post",
  {
    title: "Preview an X post/thread (no network, posts NOTHING)",
    description:
      "Dry-run: show exactly what would be posted to X — the auto-split numbered thread (X's 280-char limit), each " +
      "segment's char count, the target Community if any, and a hashtag-reach lint. Makes no network call and needs no " +
      "token. Always preview before publish_x_post.",
    inputSchema: {
      text: z.string().describe("The post text. Long text auto-splits into a numbered reply thread."),
      communityId: z.string().optional().describe("Post the thread root into this X Community id (topical targeting)."),
      number: z.boolean().optional().describe("Append (i/n) counters when threading (default true)."),
    },
  },
  async ({ text, communityId, number }) => {
    const body = renderPlan(text, number ?? true, communityId);
    return {
      content: [
        { type: "text", text: `PREVIEW ONLY — nothing was posted.\n\n${body}\n\n${REACH_TIPS}\n\nTo publish, call publish_x_post with confirm: true.` },
      ],
    };
  },
);

server.registerTool(
  "publish_x_post",
  {
    title: "Publish a post/thread to X (PUBLIC, IRREVERSIBLE — requires confirm: true)",
    description:
      "Actually post to X (auto-splitting long text into a numbered reply thread; optional communityId routes the root " +
      "into an X Community). PUBLIC and cannot be undone, so it refuses unless confirm is true AND X_ACCESS_TOKEN is set; " +
      "without confirm it returns the preview. Best practice: preview_x_post, show the user, get approval, then confirm. " +
      "Returns the posted URL(s) (the first segment is the thread root).",
    inputSchema: {
      text: z.string().describe("The post text."),
      communityId: z.string().optional().describe("Post the thread root into this X Community id."),
      number: z.boolean().optional().describe("Append (i/n) counters when threading (default true)."),
      confirm: z.boolean().optional().describe("Must be true to actually post. Omitted/false returns a preview."),
    },
  },
  async ({ text, communityId, number, confirm }) => {
    if (!confirm) {
      return {
        content: [
          {
            type: "text",
            text: `NOT PUBLISHED (confirm was not true). Preview:\n\n${renderPlan(text, number ?? true, communityId)}\n\nRe-call with confirm: true to post for real.`,
          },
        ],
      };
    }
    const pub = buildXPublisher(process.env, undefined, communityId);
    if (!pub) {
      return {
        content: [{ type: "text", text: "Not configured: set X_ACCESS_TOKEN (OAuth2 user token, scope tweet.write), then retry." }],
      };
    }
    const segments = splitThread(text, X_CHAR_LIMIT, number ?? true);
    const results = await pub.publish(segments);
    const okCount = results.filter((r) => r.ok).length;
    const root = results.find((r) => r.ok && r.url)?.url;
    const lint = lintHashtags(text);
    const out = [
      `Published to X: ${okCount}/${segments.length} segment(s)${communityId ? ` → Community ${communityId}` : ""}.`,
      root ? `Thread root: ${root}` : "",
      lint.warn ? `⚠️ ${lint.note}` : "",
      ...results.filter((r) => !r.ok).map((r) => `❌ segment ${r.segment}: ${r.error}`),
    ].filter(Boolean);
    return { content: [{ type: "text", text: out.join("\n") }] };
  },
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  console.error(`x-poster MCP server running on stdio (${isXConfigured() ? "token present" : "no token — preview only"})`);
}

main().catch((err) => {
  console.error("Fatal error starting x-poster MCP server:", err);
  process.exit(1);
});

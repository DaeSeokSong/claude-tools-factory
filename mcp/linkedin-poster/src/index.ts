#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { planLinkedIn, LINKEDIN_CHAR_LIMIT, buildLinkedIn, isLinkedInConfigured } from "social-core";

const TIPS =
  "LinkedIn tips: put the hook in the first ~210 chars (the part shown before “see more”); posts of ~1,300–1,900 chars " +
  "tend to perform best; 3–5 niche hashtags at the end (more than 5 cuts reach).";

function render(text: string): string {
  const p = planLinkedIn(text);
  const lines = [
    `LinkedIn — single post (${p.length}/${LINKEDIN_CHAR_LIMIT})${p.withinLimit ? "" : "  ⚠️ OVER LIMIT — will be rejected"}`,
    `preview (before “see more”): ${p.seeMore}${p.length > 210 ? " …" : ""}`,
    `Hashtags: ${p.note}${p.hashtagWarn ? "  ⚠️" : ""}`,
    "",
    "--- full post ---",
    p.text,
  ];
  return lines.join("\n");
}

const server = new McpServer({ name: "linkedin-poster", version: "0.1.0" });

server.registerTool(
  "linkedin_status",
  {
    title: "Show LinkedIn posting configuration (no secrets revealed)",
    description:
      "Report whether LinkedIn credentials are present (booleans only, never token values), the character limit, and the " +
      "env vars needed. Use to check setup before publishing.",
    inputSchema: {},
  },
  async () => {
    const lines = [
      `LinkedIn poster: ${isLinkedInConfigured() ? "✅ configured" : "—  not configured"}`,
      `Character limit: ${LINKEDIN_CHAR_LIMIT} (single post; no native threads)`,
      "Credentials (env): LINKEDIN_ACCESS_TOKEN (scope w_member_social) + LINKEDIN_AUTHOR_URN (or LINKEDIN_PERSON_ID).",
      "",
      TIPS,
    ];
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

server.registerTool(
  "preview_linkedin_post",
  {
    title: "Preview a LinkedIn post (no network, posts NOTHING)",
    description:
      "Dry-run: show exactly what would be posted to LinkedIn — the full text, its length vs 3000, the part shown before " +
      "“see more”, and hashtag advice. Makes no network call and needs no token. Always preview before publish_linkedin_post.",
    inputSchema: {
      text: z.string().describe("The post text (LinkedIn is a single long-form post, not a thread)."),
    },
  },
  async ({ text }) => {
    return {
      content: [{ type: "text", text: `PREVIEW ONLY — nothing was posted.\n\n${render(text)}\n\nTo publish, call publish_linkedin_post with confirm: true.` }],
    };
  },
);

server.registerTool(
  "publish_linkedin_post",
  {
    title: "Publish a post to LinkedIn (PUBLIC, IRREVERSIBLE — requires confirm: true)",
    description:
      "Actually post to LinkedIn (a single post). PUBLIC and cannot be undone, so it refuses unless confirm is true AND " +
      "credentials are set; without confirm it returns the preview. Best practice: preview_linkedin_post, show the user, " +
      "get approval, then confirm. Returns the posted URL.",
    inputSchema: {
      text: z.string().describe("The post text."),
      confirm: z.boolean().optional().describe("Must be true to actually post. Omitted/false returns a preview."),
    },
  },
  async ({ text, confirm }) => {
    if (!confirm) {
      return {
        content: [{ type: "text", text: `NOT PUBLISHED (confirm was not true). Preview:\n\n${render(text)}\n\nRe-call with confirm: true to post for real.` }],
      };
    }
    const pub = buildLinkedIn(process.env);
    if (!pub) {
      return {
        content: [{ type: "text", text: "Not configured: set LINKEDIN_ACCESS_TOKEN + LINKEDIN_AUTHOR_URN (or LINKEDIN_PERSON_ID), then retry." }],
      };
    }
    const p = planLinkedIn(text);
    if (!p.withinLimit) {
      return { content: [{ type: "text", text: `Not posted: ${p.length}/${LINKEDIN_CHAR_LIMIT} chars — over the limit. Trim it and retry.` }] };
    }
    const r = await pub.publish(text);
    return { content: [{ type: "text", text: r.ok ? `Published to LinkedIn — ${r.url}` : `LinkedIn post failed: ${r.error}` }] };
  },
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  console.error(`linkedin-poster MCP server running on stdio (${isLinkedInConfigured() ? "configured" : "no token — preview only"})`);
}

main().catch((err) => {
  console.error("Fatal error starting linkedin-poster MCP server:", err);
  process.exit(1);
});

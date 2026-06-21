#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  slackToText,
  planX,
  planLinkedIn,
  xWeight,
  X_CHAR_LIMIT,
  LINKEDIN_CHAR_LIMIT,
} from "./format.js";
import { buildX, buildLinkedIn, isXConfigured, isLinkedInConfigured } from "./publish.js";

type Platform = "x" | "linkedin";
const ALL: Platform[] = ["x", "linkedin"];

function resolve(requested: string[] | undefined, fallback: Platform[]): Platform[] {
  if (!requested || !requested.length) return fallback;
  return requested.filter((p): p is Platform => p === "x" || p === "linkedin");
}

function renderPlan(clean: string, platforms: Platform[], number: boolean, communityId?: string): string {
  const out: string[] = [];
  if (platforms.includes("x")) {
    const p = planX(clean, number);
    out.push(`### X (Twitter) — ${p.segments.length > 1 ? `thread of ${p.segments.length}` : "single post"}${communityId ? ` → Community ${communityId}` : ""}`);
    p.segments.forEach((s, i) => out.push(`  [${i + 1}/${p.segments.length}] (${xWeight(s)}/${X_CHAR_LIMIT}) ${s}`));
    out.push(`  Hashtags: ${p.note}${p.hashtagWarn ? "  ⚠️" : ""}`, "");
  }
  if (platforms.includes("linkedin")) {
    const p = planLinkedIn(clean);
    out.push(`### LinkedIn — single post (${p.length}/${LINKEDIN_CHAR_LIMIT})${p.withinLimit ? "" : "  ⚠️ OVER LIMIT — will be rejected"}`);
    out.push(`  preview (before “see more”): ${p.seeMore}${p.length > 210 ? " …" : ""}`);
    out.push(`  Hashtags: ${p.note}${p.hashtagWarn ? "  ⚠️" : ""}`, "");
  }
  return out.join("\n").trim();
}

const server = new McpServer({ name: "crosspost", version: "0.1.0" });

server.registerTool(
  "crosspost_status",
  {
    title: "Show which platforms are configured for cross-posting (no secrets revealed)",
    description:
      "Report whether X and LinkedIn credentials are present (booleans only, never token values), their character limits, " +
      "and the env vars needed. Use to check setup before publishing.",
    inputSchema: {},
  },
  async () => {
    const lines = [
      "Cross-post targets:",
      `  ${isXConfigured() ? "✅" : "—"} X (Twitter)  limit ${X_CHAR_LIMIT} weighted (auto-threads)  · env: X_ACCESS_TOKEN`,
      `  ${isLinkedInConfigured() ? "✅" : "—"} LinkedIn      limit ${LINKEDIN_CHAR_LIMIT} (single post)   · env: LINKEDIN_ACCESS_TOKEN + LINKEDIN_AUTHOR_URN (or LINKEDIN_PERSON_ID)`,
      "",
      "Source text is cleaned of Slack markup (*, _, ~, `code`, <url|label>, <@user>, <#chan>) before formatting per platform.",
    ];
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

server.registerTool(
  "preview_crosspost",
  {
    title: "Preview a Slack message reformatted for X + LinkedIn (no network, posts NOTHING)",
    description:
      "Dry-run: clean Slack markup from `text`, then show exactly what would post — X as a weighted 280-char numbered " +
      "thread, LinkedIn as a single post (with its length vs 3000 and the part shown before “see more”), plus per-platform " +
      "hashtag advice. No network, no credentials. Always preview before publish_crosspost.",
    inputSchema: {
      text: z.string().describe("The message to cross-post (your Slack message; Slack markup is cleaned automatically)."),
      platforms: z.array(z.enum(["x", "linkedin"])).optional().describe("Targets (default: both)."),
      communityId: z.string().optional().describe("Optional X Community id to route the thread root into."),
      number: z.boolean().optional().describe("Number the X thread segments (i/n) (default true)."),
    },
  },
  async ({ text, platforms, communityId, number }) => {
    const clean = slackToText(text);
    const targets = resolve(platforms, ALL);
    if (!targets.length) return { content: [{ type: "text", text: "No valid platforms. Choose from: x, linkedin." }] };
    const body = renderPlan(clean, targets, number ?? true, communityId);
    return {
      content: [
        {
          type: "text",
          text: `PREVIEW ONLY — nothing was posted.\n\nCleaned source:\n«${clean}»\n\n${body}\n\nTo publish, call publish_crosspost with confirm: true.`,
        },
      ],
    };
  },
);

server.registerTool(
  "publish_crosspost",
  {
    title: "Cross-post a Slack message to X + LinkedIn (PUBLIC, IRREVERSIBLE — requires confirm: true)",
    description:
      "Clean the Slack markup and post to each target: X as a numbered thread, LinkedIn as a single post. PUBLIC and cannot " +
      "be undone, so it refuses unless confirm is true AND that platform's credentials exist; without confirm it returns the " +
      "preview. Best practice: preview_crosspost, show the user, get approval, then confirm. Returns the posted URLs.",
    inputSchema: {
      text: z.string().describe("The message to cross-post (Slack markup is cleaned automatically)."),
      platforms: z.array(z.enum(["x", "linkedin"])).optional().describe("Targets (default: every configured platform)."),
      communityId: z.string().optional().describe("Optional X Community id to route the thread root into."),
      number: z.boolean().optional().describe("Number the X thread segments (i/n) (default true)."),
      confirm: z.boolean().optional().describe("Must be true to actually post. Omitted/false returns a preview."),
    },
  },
  async ({ text, platforms, communityId, number, confirm }) => {
    const clean = slackToText(text);
    if (!confirm) {
      const targets = resolve(platforms, ALL);
      return {
        content: [
          {
            type: "text",
            text: `NOT PUBLISHED (confirm was not true). Preview:\n\nCleaned source:\n«${clean}»\n\n${renderPlan(clean, targets, number ?? true, communityId)}\n\nRe-call with confirm: true to post for real.`,
          },
        ],
      };
    }

    const configured: Platform[] = [];
    if (isXConfigured()) configured.push("x");
    if (isLinkedInConfigured()) configured.push("linkedin");
    const targets = resolve(platforms, configured);
    if (!targets.length) {
      return {
        content: [
          {
            type: "text",
            text: "No configured platform to publish to. Set X_ACCESS_TOKEN and/or LINKEDIN_ACCESS_TOKEN + LINKEDIN_AUTHOR_URN, then retry.",
          },
        ],
      };
    }

    const out: string[] = [];
    if (targets.includes("x")) {
      const pub = buildX(process.env, undefined, communityId);
      if (!pub) out.push("### X: ❌ not configured (X_ACCESS_TOKEN) — skipped");
      else {
        const p = planX(clean, number ?? true);
        const results = await pub.publish(p.segments);
        const ok = results.filter((r) => r.ok).length;
        const root = results.find((r) => r.ok && r.url)?.url;
        out.push(`### X: ${ok}/${p.segments.length} segment(s) posted${root ? ` — ${root}` : ""}`);
        for (const r of results.filter((r) => !r.ok)) out.push(`  ❌ segment ${r.segment}: ${r.error}`);
      }
    }
    if (targets.includes("linkedin")) {
      const pub = buildLinkedIn(process.env);
      const p = planLinkedIn(clean);
      if (!pub) out.push("### LinkedIn: ❌ not configured (LINKEDIN_ACCESS_TOKEN + author) — skipped");
      else if (!p.withinLimit) out.push(`### LinkedIn: ❌ ${p.length}/${LINKEDIN_CHAR_LIMIT} chars — over limit, not posted (trim it)`);
      else {
        const r = await pub.publish(clean);
        out.push(r.ok ? `### LinkedIn: ✅ posted — ${r.url}` : `### LinkedIn: ❌ ${r.error}`);
      }
    }
    return { content: [{ type: "text", text: `Cross-post complete.\n\n${out.join("\n")}` }] };
  },
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  const c = [isXConfigured() ? "x" : null, isLinkedInConfigured() ? "linkedin" : null].filter(Boolean);
  console.error(`crosspost MCP server running on stdio (configured: ${c.length ? c.join(", ") : "none — preview only"})`);
}

main().catch((err) => {
  console.error("Fatal error starting crosspost MCP server:", err);
  process.exit(1);
});

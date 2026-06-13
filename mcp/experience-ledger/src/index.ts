#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  append,
  findMatches,
  fingerprint,
  ledgerPath,
  loadAll,
  newId,
  type ExperienceRecord,
  type Match,
  type Outcome,
} from "./store.js";

const ICON: Record<Outcome, string> = { success: "✅", failure: "❌", partial: "🟡" };

function renderRecord(r: ExperienceRecord, indent = ""): string {
  const lines = [
    `${indent}${ICON[r.outcome]} [${r.outcome}] ${r.what}`,
    `${indent}   when: ${r.when} · who: ${r.who}${r.where ? ` · where: ${r.where}` : ""}`,
  ];
  if (r.why) lines.push(`${indent}   why: ${r.why}`);
  if (r.how) lines.push(`${indent}   how: ${r.how}`);
  if (r.rootCause) lines.push(`${indent}   root cause: ${r.rootCause}`);
  if (r.result) lines.push(`${indent}   result: ${r.result}`);
  if (r.resolution) lines.push(`${indent}   resolution / next time: ${r.resolution}`);
  if (r.tags.length) lines.push(`${indent}   tags: ${r.tags.join(", ")}`);
  lines.push(`${indent}   id: ${r.id}`);
  return lines.join("\n");
}

function renderMatches(matches: Match[]): string {
  const fails = matches.filter((m) => m.record.outcome === "failure");
  const oks = matches.filter((m) => m.record.outcome === "success");
  const partials = matches.filter((m) => m.record.outcome === "partial");
  const out: string[] = [];
  if (fails.length) {
    out.push(`⚠️ ${fails.length} prior FAILURE(s) on the same/similar action — do NOT blindly repeat; apply the resolution:`);
    for (const m of fails) out.push(renderRecord(m.record, "  "));
    out.push("");
  }
  if (oks.length) {
    out.push(`✅ ${oks.length} prior SUCCESS(es) — reuse the known-good approach:`);
    for (const m of oks) out.push(renderRecord(m.record, "  "));
    out.push("");
  }
  if (partials.length) {
    out.push(`🟡 ${partials.length} partial attempt(s):`);
    for (const m of partials) out.push(renderRecord(m.record, "  "));
  }
  return out.join("\n").trim();
}

const server = new McpServer({ name: "experience-ledger", version: "0.1.0" });

server.registerTool(
  "recall_experience",
  {
    title: "Recall prior attempts BEFORE acting (avoid repeating a known fail/success)",
    description:
      "Call this BEFORE attempting any non-trivial, risky, or previously-tried action. Given a plain-language description " +
      "of what you are about to do, it returns prior recorded attempts at the same or a similar action, with their outcome, " +
      "root cause, and resolution — so you skip a known dead-end, apply the known fix, or reuse a known-good approach instead " +
      "of blindly repeating it.",
    inputSchema: {
      what: z.string().describe("The action you are about to attempt, in plain language."),
    },
  },
  async ({ what }) => {
    const matches = findMatches(what, loadAll());
    if (!matches.length) {
      return {
        content: [
          {
            type: "text",
            text: `No prior experience recorded for "${what}". Proceed, then log the outcome with record_experience.`,
          },
        ],
      };
    }
    return { content: [{ type: "text", text: renderMatches(matches) }] };
  },
);

server.registerTool(
  "record_experience",
  {
    title: "Record an attempt's outcome (5W1H + root cause + result)",
    description:
      "Call this AFTER attempting an action — especially on FAILURE — so it is not blindly repeated later. Capture the 5W1H " +
      "(who / what / when / where / why / how), the outcome, the root cause, the detailed result, and (for failures) the " +
      "resolution to apply next time. Returns the saved id plus any earlier matching attempts, so repetition is visible.",
    inputSchema: {
      what: z.string().describe("The action attempted (the matching key), in plain language."),
      outcome: z.enum(["success", "failure", "partial"]).describe("How it turned out."),
      result: z.string().describe("Detailed result / what was observed."),
      who: z.string().optional().describe("WHO acted (model / agent / user). Default 'agent'."),
      where: z.string().optional().describe("WHERE: repo / file / environment / project."),
      why: z.string().optional().describe("WHY: intent / goal behind the action."),
      how: z.string().optional().describe("HOW: method / approach used."),
      rootCause: z.string().optional().describe("Why it failed or succeeded (root-cause analysis)."),
      resolution: z.string().optional().describe("For failures: the fix / what to do next time."),
      tags: z.array(z.string()).optional().describe("Optional tags for grouping / search."),
      when: z.string().optional().describe("ISO timestamp; defaults to now."),
    },
  },
  async (a) => {
    const priors = findMatches(a.what, loadAll());
    const rec: ExperienceRecord = {
      id: newId(),
      who: a.who ?? "agent",
      what: a.what,
      when: a.when ?? new Date().toISOString(),
      where: a.where ?? "",
      why: a.why ?? "",
      how: a.how ?? "",
      outcome: a.outcome,
      rootCause: a.rootCause ?? "",
      result: a.result,
      resolution: a.resolution ?? "",
      tags: a.tags ?? [],
      fingerprint: fingerprint(a.what),
    };
    append(rec);
    const lines = [`Recorded ${ICON[rec.outcome]} ${rec.outcome} — id ${rec.id} (ledger: ${ledgerPath()}).`];
    if (priors.length) {
      lines.push("", `⚠️ ${priors.length} earlier attempt(s) on a similar action already existed:`, renderMatches(priors));
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

server.registerTool(
  "list_experiences",
  {
    title: "List / search recorded experiences",
    description: "Browse or search the ledger. Filter by free-text query (over what/why/result/cause/tags), outcome, or tag.",
    inputSchema: {
      query: z.string().optional().describe("Free-text filter."),
      outcome: z.enum(["success", "failure", "partial"]).optional().describe("Filter by outcome."),
      tag: z.string().optional().describe("Filter by tag."),
      limit: z.number().int().positive().max(100).optional().describe("Max records (default 20, newest first)."),
    },
  },
  async ({ query, outcome, tag, limit }) => {
    let recs = loadAll();
    if (outcome) recs = recs.filter((r) => r.outcome === outcome);
    if (tag) recs = recs.filter((r) => r.tags.includes(tag));
    if (query) {
      const q = query.toLowerCase();
      recs = recs.filter((r) =>
        [r.what, r.why, r.result, r.rootCause, r.resolution, ...r.tags].join(" ").toLowerCase().includes(q),
      );
    }
    recs = recs.sort((a, b) => b.when.localeCompare(a.when)).slice(0, limit ?? 20);
    if (!recs.length) return { content: [{ type: "text", text: "No matching experiences." }] };
    return {
      content: [{ type: "text", text: `${recs.length} record(s):\n\n` + recs.map((r) => renderRecord(r)).join("\n\n") }],
    };
  },
);

server.registerTool(
  "experience_stats",
  {
    title: "Summary of the ledger (repetition hotspots)",
    description:
      "Counts by outcome plus the most-repeated actions — surfaces where the same thing is attempted again and again.",
    inputSchema: {},
  },
  async () => {
    const all = loadAll();
    if (!all.length) return { content: [{ type: "text", text: `Ledger is empty (${ledgerPath()}).` }] };
    const byOutcome: Record<Outcome, number> = { success: 0, failure: 0, partial: 0 };
    const byFp = new Map<string, { what: string; count: number; outcomes: Record<Outcome, number> }>();
    for (const r of all) {
      byOutcome[r.outcome]++;
      const e = byFp.get(r.fingerprint) ?? { what: r.what, count: 0, outcomes: { success: 0, failure: 0, partial: 0 } };
      e.count++;
      e.outcomes[r.outcome]++;
      byFp.set(r.fingerprint, e);
    }
    const repeated = [...byFp.values()].filter((e) => e.count > 1).sort((a, b) => b.count - a.count).slice(0, 10);
    const lines = [
      `Ledger: ${ledgerPath()}`,
      `Total: ${all.length} · ✅ ${byOutcome.success}  ❌ ${byOutcome.failure}  🟡 ${byOutcome.partial}`,
    ];
    if (repeated.length) {
      lines.push("", "Most-repeated actions (repetition hotspots):");
      for (const e of repeated) {
        lines.push(`• ${e.count}× "${e.what}" — ✅${e.outcomes.success} ❌${e.outcomes.failure} 🟡${e.outcomes.partial}`);
      }
    } else {
      lines.push("", "No action has been attempted more than once yet.");
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  console.error(`experience-ledger MCP server running on stdio (ledger: ${ledgerPath()})`);
}

main().catch((err) => {
  console.error("Fatal error starting experience-ledger MCP server:", err);
  process.exit(1);
});

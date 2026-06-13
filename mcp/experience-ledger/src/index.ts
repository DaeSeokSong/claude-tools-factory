#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  append,
  chainFor,
  dayOf,
  findMatches,
  fingerprint,
  ledgerPath,
  loadAll,
  newId,
  rankByRelevance,
  type ExperienceRecord,
  type Match,
  type Outcome,
} from "./store.js";

const ICON: Record<Outcome, string> = { success: "✅", failure: "❌", partial: "🟡" };

function deriveTitle(what: string, title?: string): string {
  if (title && title.trim()) return title.trim().replace(/\s+/g, " ");
  const oneLine = what.replace(/\s+/g, " ").trim();
  return oneLine.length > 80 ? oneLine.slice(0, 77) + "..." : oneLine;
}

function renderRecord(r: ExperienceRecord, indent = ""): string {
  const lines = [
    `${indent}${ICON[r.outcome]} ${r.title || r.what}`,
    `${indent}   what: ${r.what}`,
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

const server = new McpServer({ name: "experience-ledger", version: "0.2.0" });

server.registerTool(
  "research_task",
  {
    title: "Pre-task research over prior experience (RAG retrieval + causal chains) — run BEFORE a task",
    description:
      "Call this BEFORE starting ANY non-trivial task, with a description of the task. It retrieves the most relevant prior " +
      "experiences (lexical relevance ranking — the RAG step) and reconstructs each action's causal chain over time (repeated " +
      "attempts and the resolution that finally worked — the DAG step), then returns a pre-task brief: what to REUSE, what to " +
      "AVOID/fix, and what is still UNRESOLVED. Cross-verify the brief, then act. Afterwards, log the outcome AND this research " +
      "with record_experience (include the tag 'research').",
    inputSchema: {
      task: z.string().describe("What you are about to do, in plain language."),
      limit: z.number().int().positive().max(20).optional().describe("Max relevant records to consider (default 8)."),
    },
  },
  async ({ task, limit }) => {
    const all = loadAll();
    if (!all.length) {
      return {
        content: [
          {
            type: "text",
            text: `No prior experience yet (${ledgerPath()}). Proceed, then log the outcome — and this research — with record_experience.`,
          },
        ],
      };
    }
    const ranked = rankByRelevance(task, all).slice(0, limit ?? 8);
    if (!ranked.length) {
      return {
        content: [
          {
            type: "text",
            text: `No prior experience is clearly relevant to "${task}". Proceed carefully, then record the outcome (and this research).`,
          },
        ],
      };
    }
    const fps = [...new Set(ranked.map((x) => x.record.fingerprint))];
    const reuse: string[] = [];
    const avoid: string[] = [];
    const open: string[] = [];
    for (const fp of fps) {
      const chain = chainFor(fp, all);
      const head = chain[chain.length - 1];
      const trail = chain.map((r) => ICON[r.outcome]).join("");
      const label = `"${head.title || head.what}" — ${chain.length} attempt(s) ${trail}`;
      const success = chain.find((r) => r.outcome === "success");
      if (success) {
        reuse.push(`✅ ${label}\n   known-good: ${success.how || success.resolution || success.result || "(see id " + success.id + ")"}`);
      } else {
        const lastFail = [...chain].reverse().find((r) => r.outcome === "failure");
        if (!lastFail) continue;
        const block = `❌ ${label}\n   cause: ${lastFail.rootCause || "—"}\n   ${lastFail.resolution ? "fix: " + lastFail.resolution : "no resolution recorded — investigate + cross-verify"}`;
        (lastFail.resolution ? avoid : open).push(block);
      }
    }
    const out: string[] = [
      `Pre-task brief for: ${task}`,
      `(${ranked.length} relevant record(s) across ${fps.length} distinct action(s))`,
      "",
    ];
    if (reuse.length) out.push("REUSE — known-good approaches:", ...reuse, "");
    if (avoid.length) out.push("AVOID / APPLY FIX — failures with a known resolution:", ...avoid, "");
    if (open.length) out.push("UNRESOLVED — failed with no known fix; investigate & cross-verify:", ...open, "");
    out.push(
      "Cross-verify these still hold before relying on them. After the task, record BOTH the outcome and this research with " +
        "record_experience (tag it 'research').",
    );
    return { content: [{ type: "text", text: out.join("\n") }] };
  },
);

server.registerTool(
  "recall_experience",
  {
    title: "Recall prior attempts BEFORE acting (avoid repeating a known fail/success)",
    description:
      "Call this BEFORE a specific, previously-tried action (narrower than research_task). Given a plain-language description " +
      "of what you are about to do, it returns prior attempts at the same or a similar action, with their outcome, root cause, " +
      "and resolution — so you skip a known dead-end, apply the known fix, or reuse a known-good approach.",
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
    title: "Record an attempt's outcome (one-line title + 5W1H + root cause + result)",
    description:
      "Call this AFTER attempting an action or finishing pre-task research — especially on FAILURE — so it is not blindly " +
      "repeated later. Give a one-line `title`, the 5W1H (who/what/when/where/why/how), the outcome, root cause, detailed " +
      "result, and (for failures) the resolution. Tag research entries with 'research'. Returns the saved id plus any earlier " +
      "matching attempts, so repetition is visible.",
    inputSchema: {
      what: z.string().describe("The action attempted (the matching key), in plain language."),
      outcome: z.enum(["success", "failure", "partial"]).describe("How it turned out."),
      result: z.string().describe("Detailed result / what was observed (or research findings)."),
      title: z.string().optional().describe("One-line summary for dated digests / RAG headlines. Defaults to `what`."),
      who: z.string().optional().describe("WHO acted (model / agent / user). Default 'agent'."),
      where: z.string().optional().describe("WHERE: repo / file / environment / project."),
      why: z.string().optional().describe("WHY: intent / goal behind the action."),
      how: z.string().optional().describe("HOW: method / approach used."),
      rootCause: z.string().optional().describe("Why it failed or succeeded (root-cause analysis)."),
      resolution: z.string().optional().describe("For failures: the fix / what to do next time."),
      tags: z.array(z.string()).optional().describe("Tags for grouping / RAG (e.g. 'research', 'git', 'build')."),
      when: z.string().optional().describe("ISO timestamp; defaults to now."),
    },
  },
  async (a) => {
    const priors = findMatches(a.what, loadAll());
    const rec: ExperienceRecord = {
      id: newId(),
      title: deriveTitle(a.what, a.title),
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
    const lines = [`Recorded ${ICON[rec.outcome]} ${rec.outcome} — "${rec.title}" (id ${rec.id}, ledger: ${ledgerPath()}).`];
    if (priors.length) {
      lines.push("", `⚠️ ${priors.length} earlier attempt(s) on a similar action already existed:`, renderMatches(priors));
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

server.registerTool(
  "list_experiences",
  {
    title: "List / search recorded experiences (by query, outcome, tag, or date)",
    description:
      "Browse or search the ledger. Filter by free-text query (over title/what/why/result/cause/tags), outcome, tag, or a " +
      "single day (YYYY-MM-DD). Newest first.",
    inputSchema: {
      query: z.string().optional().describe("Free-text filter."),
      outcome: z.enum(["success", "failure", "partial"]).optional().describe("Filter by outcome."),
      tag: z.string().optional().describe("Filter by tag."),
      date: z.string().optional().describe("Filter to a single day (YYYY-MM-DD)."),
      limit: z.number().int().positive().max(100).optional().describe("Max records (default 20)."),
    },
  },
  async ({ query, outcome, tag, date, limit }) => {
    let recs = loadAll();
    if (outcome) recs = recs.filter((r) => r.outcome === outcome);
    if (tag) recs = recs.filter((r) => r.tags.includes(tag));
    if (date) recs = recs.filter((r) => dayOf(r) === date);
    if (query) {
      const q = query.toLowerCase();
      recs = recs.filter((r) =>
        [r.title, r.what, r.why, r.result, r.rootCause, r.resolution, ...r.tags].join(" ").toLowerCase().includes(q),
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
    title: "Summary of the ledger (per-day digest + repetition hotspots)",
    description:
      "Counts by outcome, a per-day digest of one-line titles, and the most-repeated actions — surfacing where the same thing " +
      "is attempted again and again.",
    inputSchema: {},
  },
  async () => {
    const all = loadAll();
    if (!all.length) return { content: [{ type: "text", text: `Ledger is empty (${ledgerPath()}).` }] };
    const byOutcome: Record<Outcome, number> = { success: 0, failure: 0, partial: 0 };
    const byFp = new Map<string, { title: string; count: number; outcomes: Record<Outcome, number> }>();
    const byDay = new Map<string, ExperienceRecord[]>();
    for (const r of all) {
      byOutcome[r.outcome]++;
      const e = byFp.get(r.fingerprint) ?? { title: r.title || r.what, count: 0, outcomes: { success: 0, failure: 0, partial: 0 } };
      e.count++;
      e.outcomes[r.outcome]++;
      byFp.set(r.fingerprint, e);
      const d = dayOf(r);
      byDay.set(d, [...(byDay.get(d) ?? []), r]);
    }
    const lines = [
      `Ledger: ${ledgerPath()}`,
      `Total: ${all.length} · ✅ ${byOutcome.success}  ❌ ${byOutcome.failure}  🟡 ${byOutcome.partial}`,
    ];
    const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a)).slice(0, 7);
    lines.push("", "Recent days (one-line titles):");
    for (const d of days) {
      lines.push(`  ${d}:`);
      for (const r of byDay.get(d)!.sort((a, b) => b.when.localeCompare(a.when))) {
        lines.push(`    ${ICON[r.outcome]} ${r.title || r.what}`);
      }
    }
    const repeated = [...byFp.values()].filter((e) => e.count > 1).sort((a, b) => b.count - a.count).slice(0, 10);
    if (repeated.length) {
      lines.push("", "Most-repeated actions (repetition hotspots):");
      for (const e of repeated) {
        lines.push(`  • ${e.count}× "${e.title}" — ✅${e.outcomes.success} ❌${e.outcomes.failure} 🟡${e.outcomes.partial}`);
      }
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

#!/usr/bin/env node
// Local end-to-end test bench for the shipped social MCP servers.
//
// Builds social-core + the three social leaves, then connects to each built server over stdio
// as a REAL MCP client (the same protocol Claude Code / Cursor use), lists its tools, and calls
// the no-network preview/status tools with a sample message — so you can see exactly what each
// server produces from "what got uploaded". Nothing is posted (no tokens needed; publish_* stays
// confirm-gated). Set X_ACCESS_TOKEN / LINKEDIN_ACCESS_TOKEN+LINKEDIN_AUTHOR_URN in your env to
// additionally exercise the publish tools.
//
// Run:  node scripts/workbench.mjs        (from the repo root, after `npm install`)
// Scratch lives in .workbench/ (gitignored). Drop a .workbench/sample.txt to use your own text.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, ".workbench"), { recursive: true });

const samplePath = join(root, ".workbench", "sample.txt");
const sample = existsSync(samplePath)
  ? readFileSync(samplePath, "utf8")
  : "*This week in AI* 🚀 We shipped a tiny MCP that turns a Slack note into an X thread and a LinkedIn post — preview first, confirm to publish, per-platform formatting. Details: <https://example.com/post|the write-up>. cc <@U042> #AI #MCP";

function build() {
  const pkgs = ["social-core", "x-poster-mcp", "linkedin-poster-mcp", "crosspost-mcp"];
  try {
    for (const p of pkgs) execSync(`npm run build -w ${p}`, { cwd: root, stdio: "ignore" });
    console.log("built: social-core + x-poster + linkedin-poster + crosspost");
  } catch {
    console.error("Build failed — run `npm install` at the repo root first, then re-run.");
    process.exit(1);
  }
}

async function exercise(name, dist, calls) {
  const transport = new StdioClientTransport({ command: "node", args: [join(root, dist)] });
  const client = new Client({ name: "workbench", version: "0.0.0" }, { capabilities: {} });
  await client.connect(transport);
  const { tools } = await client.listTools();
  console.log(`\n${"=".repeat(72)}\n${name}  —  tools: ${tools.map((t) => t.name).join(", ")}\n${"=".repeat(72)}`);
  for (const c of calls) {
    const res = await client.callTool({ name: c.name, arguments: c.args });
    const text = (res.content ?? []).map((b) => (b.type === "text" ? b.text : "")).join("\n");
    console.log(`\n--- ${c.name} ---\n${text}`);
  }
  await client.close();
}

async function main() {
  build();
  await exercise("x-poster", "mcp/x-poster/dist/index.js", [
    { name: "x_status", args: {} },
    { name: "preview_x_post", args: { text: sample } },
  ]);
  await exercise("linkedin-poster", "mcp/linkedin-poster/dist/index.js", [
    { name: "linkedin_status", args: {} },
    { name: "preview_linkedin_post", args: { text: sample } },
  ]);
  await exercise("crosspost", "mcp/crosspost/dist/index.js", [
    { name: "crosspost_status", args: {} },
    { name: "preview_crosspost", args: { text: sample } },
  ]);
  console.log("\nworkbench done — no network, nothing posted.");
}

main().catch((err) => {
  console.error("workbench error:", err);
  process.exit(1);
});

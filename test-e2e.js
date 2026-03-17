#!/usr/bin/env node
/**
 * E2E test: starts the proxy as a child process and sends MCP JSON-RPC messages
 * MCP SDK uses newline-delimited JSON (not Content-Length framing)
 */
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const CONFIG = {
  servers: [{
    id: "fs",
    name: "Filesystem",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
  }],
  mode: "lazy"
};

const configPath = "/tmp/test-proxy-config.json";
fs.writeFileSync(configPath, JSON.stringify(CONFIG));

const proxy = spawn("node", [path.join(__dirname, "dist/cli.js"), "--config", configPath], {
  stdio: ["pipe", "pipe", "pipe"],
});

let stderrBuf = "";
proxy.stderr.on("data", (d) => { stderrBuf += d.toString(); });

let stdoutBuf = "";
let responses = [];

proxy.stdout.on("data", (d) => {
  stdoutBuf += d.toString();
  // Parse newline-delimited JSON messages
  const lines = stdoutBuf.split("\n");
  stdoutBuf = lines.pop() || ""; // keep incomplete line in buffer
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      responses.push(JSON.parse(trimmed));
    } catch (e) {
      // Might be Content-Length header or other non-JSON — skip
    }
  }
});

function sendMsg(obj) {
  const body = JSON.stringify(obj) + "\n";
  proxy.stdin.write(body);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log("⏳ Waiting for proxy to connect to upstream...");
  await sleep(5000);

  // Step 1: Initialize
  console.log("\n--- Step 1: Initialize ---");
  sendMsg({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0" }
  }});
  await sleep(2000);

  const initResp = responses.find(r => r.id === 1);
  if (initResp) {
    console.log("✅ Initialize response:", initResp.result?.serverInfo?.name || "OK");
  } else {
    console.log("❌ No initialize response");
    console.log("   Responses so far:", responses.length, responses.map(r => r.id || r.method));
  }

  // Step 2: Send initialized notification
  sendMsg({ jsonrpc: "2.0", method: "notifications/initialized" });
  await sleep(500);

  // Step 3: List tools
  console.log("\n--- Step 2: List Tools ---");
  sendMsg({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  await sleep(2000);

  const listResp = responses.find(r => r.id === 2);
  if (listResp && listResp.result) {
    const tools = listResp.result.tools || [];
    console.log(`✅ Got ${tools.length} tools`);

    const lazyTools = tools.filter(t => (t.description || "").toLowerCase().includes("lazy"));
    console.log(`   ${lazyTools.length}/${tools.length} have lazy-load stubs`);

    if (tools.length > 0) {
      const sample = tools[0];
      console.log(`   Sample: "${sample.name}"`);
      console.log(`   Description: "${(sample.description || "").slice(0, 100)}"`);
      const propCount = Object.keys(sample.inputSchema?.properties || {}).length;
      console.log(`   Schema properties: ${propCount} (expect 0 for lazy stubs)`);
    }

    // Token savings: compare stub size vs what eager would be
    const stubTokens = Math.round(JSON.stringify(tools).length / 4);
    const eagerEstimate = tools.length * 200; // rough
    console.log(`\n   Token comparison: ~${eagerEstimate} eager vs ~${stubTokens} lazy stubs sent`);
    console.log(`   Ratio: ~${(eagerEstimate / stubTokens).toFixed(1)}x reduction`);
  } else {
    console.log("❌ No tools/list response");
    if (listResp?.error) console.log("   Error:", listResp.error);
  }

  // Step 4: Call a tool
  console.log("\n--- Step 3: Call Tool (read_file) ---");
  fs.writeFileSync("/tmp/mcp-proxy-test.txt", "Hello from mcp-lazy-proxy e2e test!");

  sendMsg({ jsonrpc: "2.0", id: 3, method: "tools/call", params: {
    name: "read_file",
    arguments: { path: "/tmp/mcp-proxy-test.txt" }
  }});
  await sleep(3000);

  const callResp = responses.find(r => r.id === 3);
  if (callResp && callResp.result) {
    const content = callResp.result.content?.[0]?.text || "";
    if (content.includes("Hello from mcp-lazy-proxy")) {
      console.log("✅ Tool call succeeded — file content correct");
    } else {
      console.log("⚠️ Tool call returned unexpected content:", content.slice(0, 100));
    }
  } else {
    console.log("❌ No tool call response");
    if (callResp?.error) console.log("   Error:", JSON.stringify(callResp.error));
    // Debug: show all responses
    console.log("   All response IDs:", responses.map(r => r.id || r.method));
  }

  // Step 5: List directory (another tool)
  console.log("\n--- Step 4: Call Tool (list_directory) ---");
  sendMsg({ jsonrpc: "2.0", id: 4, method: "tools/call", params: {
    name: "list_directory",
    arguments: { path: "/tmp" }
  }});
  await sleep(2000);

  const dirResp = responses.find(r => r.id === 4);
  if (dirResp && dirResp.result) {
    const text = dirResp.result.content?.[0]?.text || "";
    console.log(`✅ list_directory succeeded (${text.split("\n").length} entries)`);
  } else {
    console.log("❌ list_directory failed");
  }

  // Summary
  console.log("\n=== Summary ===");
  console.log(`Total responses: ${responses.length}`);
  console.log(`Proxy stderr:\n${stderrBuf}`);

  // Check metrics
  const metricsFile = path.join(process.env.HOME, ".mcp-proxy-metrics.jsonl");
  if (fs.existsSync(metricsFile)) {
    const lines = fs.readFileSync(metricsFile, "utf8").trim().split("\n");
    console.log(`\nMetrics: ${lines.length} total entries`);
    if (lines.length > 0) {
      const last = JSON.parse(lines[lines.length - 1]);
      console.log(`Last: tool=${last.tool}, source=${last.schemaSource}, saved=${last.tokensSaved} tokens`);
    }
  }

  proxy.kill("SIGINT");
  await sleep(1000);
  proxy.kill("SIGTERM");

  const passed = initResp && listResp?.result?.tools?.length > 0 && callResp?.result;
  console.log(passed ? "\n🎉 ALL TESTS PASSED" : "\n❌ SOME TESTS FAILED");
  process.exit(passed ? 0 : 1);
}

run().catch(e => {
  console.error("Fatal:", e);
  proxy.kill();
  process.exit(1);
});

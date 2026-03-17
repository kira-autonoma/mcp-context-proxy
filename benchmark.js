#!/usr/bin/env node
/**
 * Benchmark: measure token savings across different MCP server counts
 * Creates mock tool schemas of realistic sizes and measures compression ratio
 */

// Simulate realistic MCP tool schemas (based on real server data)
function generateRealisticSchemas(serverCount, toolsPerServer) {
  const servers = [];
  const serverNames = [
    "filesystem", "github", "postgres", "slack", "notion",
    "jira", "confluence", "linear", "supabase", "stripe",
    "twilio", "sendgrid", "cloudflare", "aws-s3", "docker",
    "kubernetes", "redis", "mongodb", "elasticsearch", "grafana"
  ];

  for (let s = 0; s < serverCount; s++) {
    const name = serverNames[s % serverNames.length];
    const tools = [];
    for (let t = 0; t < toolsPerServer; t++) {
      // Realistic schema with 3-8 properties, descriptions, enums
      const propCount = 3 + Math.floor(Math.random() * 6);
      const properties = {};
      const required = [];
      for (let p = 0; p < propCount; p++) {
        const propName = `param_${p}`;
        properties[propName] = {
          type: Math.random() > 0.3 ? "string" : Math.random() > 0.5 ? "number" : "boolean",
          description: `Description for ${propName} in ${name}_tool_${t}. This parameter controls the behavior of the operation and accepts various formats.`,
        };
        if (Math.random() > 0.5) {
          properties[propName].enum = ["option_a", "option_b", "option_c", "option_d"];
        }
        if (Math.random() > 0.3) {
          required.push(propName);
        }
      }

      tools.push({
        name: `${name}_tool_${t}`,
        description: `Performs operation ${t} on ${name}. This tool allows you to interact with the ${name} service to manage resources, query data, and perform administrative tasks. Supports filtering, pagination, and batch operations.`,
        inputSchema: { type: "object", properties, required },
      });
    }
    servers.push({ name, tools });
  }
  return servers;
}

function generateStub(tool) {
  return {
    name: tool.name,
    description: tool.description.split(".")[0] + ". [Schema lazy-loaded on first call]",
    inputSchema: {
      type: "object",
      description: "Call this tool to auto-fetch its schema.",
      properties: {},
    },
  };
}

function tokensForJson(obj) {
  return Math.ceil(JSON.stringify(obj).length / 4);
}

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║     MCP Context Compression Proxy — Token Savings Benchmark ║");
console.log("╠══════════════════════════════════════════════════════════════╣");
console.log("║ Servers │ Tools │ Eager Tokens │ Lazy Tokens │ Savings │ Ratio║");
console.log("╠══════════════════════════════════════════════════════════════╣");

const configs = [
  { servers: 1, toolsPerServer: 10 },
  { servers: 3, toolsPerServer: 10 },
  { servers: 5, toolsPerServer: 12 },
  { servers: 10, toolsPerServer: 10 },
  { servers: 10, toolsPerServer: 20 },
  { servers: 15, toolsPerServer: 15 },
  { servers: 20, toolsPerServer: 10 },
];

const results = [];

for (const cfg of configs) {
  const servers = generateRealisticSchemas(cfg.servers, cfg.toolsPerServer);
  const totalTools = servers.reduce((s, srv) => s + srv.tools.length, 0);

  let eagerTokens = 0;
  let lazyTokens = 0;

  for (const srv of servers) {
    for (const tool of srv.tools) {
      eagerTokens += tokensForJson(tool);
      lazyTokens += tokensForJson(generateStub(tool));
    }
  }

  const saved = eagerTokens - lazyTokens;
  const ratio = (eagerTokens / lazyTokens).toFixed(1);

  const row = `║ ${String(cfg.servers).padStart(7)} │ ${String(totalTools).padStart(5)} │ ${String(eagerTokens.toLocaleString()).padStart(12)} │ ${String(lazyTokens.toLocaleString()).padStart(11)} │ ${String(saved.toLocaleString()).padStart(7)} │ ${ratio.padStart(5)}x║`;
  console.log(row);

  results.push({ servers: cfg.servers, tools: totalTools, eagerTokens, lazyTokens, saved, ratio });
}

console.log("╚══════════════════════════════════════════════════════════════╝");

// Cost calculation
console.log("\n=== Cost Impact (at $3/MTok input) ===");
for (const r of results) {
  const eagerCostPer1000 = (r.eagerTokens / 1000000 * 3 * 1000).toFixed(2);
  const lazyCostPer1000 = (r.lazyTokens / 1000000 * 3 * 1000).toFixed(2);
  const savedPer1000 = (r.saved / 1000000 * 3 * 1000).toFixed(2);
  console.log(`${r.servers} servers, ${r.tools} tools: $${eagerCostPer1000}/1K calls eager → $${lazyCostPer1000}/1K calls lazy (save $${savedPer1000}/1K calls)`);
}

// Monthly cost at 100 calls/day
console.log("\n=== Monthly Savings (100 API calls/day, $3/MTok) ===");
for (const r of results) {
  const monthly = r.saved / 1000000 * 3 * 100 * 30;
  if (monthly >= 1) {
    console.log(`${r.servers} servers: $${monthly.toFixed(0)}/month saved`);
  }
}

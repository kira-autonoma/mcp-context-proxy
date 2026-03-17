#!/usr/bin/env node
/**
 * MCP Context Compression Proxy CLI
 *
 * Usage:
 *   mcp-proxy --config proxy.json
 *   mcp-proxy --server "filesystem:stdio:npx:-y:@modelcontextprotocol/server-filesystem:/tmp"
 *
 * Config format (proxy.json):
 * {
 *   "servers": [
 *     { "id": "fs", "name": "Filesystem", "transport": "stdio",
 *       "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"] }
 *   ],
 *   "mode": "lazy"
 * }
 */

import * as fs from "fs";
import * as path from "path";
import { MCPContextProxy } from "./proxy-server";
import { ProxyConfig, ServerConfig } from "./types";

function parseArgs(): ProxyConfig {
  const args = process.argv.slice(2);

  // --config <file>
  const configIdx = args.indexOf("--config");
  if (configIdx !== -1 && args[configIdx + 1]) {
    const configFile = args[configIdx + 1];
    const raw = fs.readFileSync(configFile, "utf8");
    return JSON.parse(raw) as ProxyConfig;
  }

  // --mode lazy|eager|stub-only
  const modeIdx = args.indexOf("--mode");
  const mode = (modeIdx !== -1 ? args[modeIdx + 1] : "lazy") as ProxyConfig["mode"];

  // --server "id:transport:command:arg1:arg2"
  const servers: ServerConfig[] = [];
  let i = 0;
  while (i < args.length) {
    if (args[i] === "--server" && args[i + 1]) {
      const parts = args[i + 1].split(":");
      const id = parts[0];
      const transport = parts[1] as "stdio";
      const command = parts[2];
      const serverArgs = parts.slice(3);
      servers.push({ id, name: id, transport, command, args: serverArgs });
      i += 2;
    } else {
      i++;
    }
  }

  if (servers.length === 0) {
    console.error(`
MCP Context Compression Proxy v0.1.0
Reduces MCP tool schema token overhead by 4-32x via lazy-loading and caching.

Usage:
  mcp-proxy --config proxy.json
  mcp-proxy --mode lazy --server "fs:stdio:npx:-y:@modelcontextprotocol/server-filesystem:/tmp"

Modes:
  lazy       (default) Load schemas on first tool use
  eager      Load all schemas upfront (no savings, for debugging)
  stub-only  Never load full schemas (maximum savings, less context for LLM)

Config file format:
  {
    "servers": [
      {
        "id": "filesystem",
        "name": "Filesystem MCP",
        "transport": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
      }
    ],
    "mode": "lazy"
  }
`);
    process.exit(1);
  }

  return { servers, mode };
}

async function main(): Promise<void> {
  try {
    const config = parseArgs();
    const proxy = new MCPContextProxy(config);
    await proxy.start();
  } catch (e) {
    console.error("[mcp-proxy] Fatal error:", e);
    process.exit(1);
  }
}

main();

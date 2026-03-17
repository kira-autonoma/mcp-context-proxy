#!/usr/bin/env node
"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const proxy_server_1 = require("./proxy-server");
function parseArgs() {
    const args = process.argv.slice(2);
    // --config <file>
    const configIdx = args.indexOf("--config");
    if (configIdx !== -1 && args[configIdx + 1]) {
        const configFile = args[configIdx + 1];
        const raw = fs.readFileSync(configFile, "utf8");
        return JSON.parse(raw);
    }
    // --mode lazy|eager|stub-only
    const modeIdx = args.indexOf("--mode");
    const mode = (modeIdx !== -1 ? args[modeIdx + 1] : "lazy");
    // --server "id:transport:command:arg1:arg2"
    const servers = [];
    let i = 0;
    while (i < args.length) {
        if (args[i] === "--server" && args[i + 1]) {
            const parts = args[i + 1].split(":");
            const id = parts[0];
            const transport = parts[1];
            const command = parts[2];
            const serverArgs = parts.slice(3);
            servers.push({ id, name: id, transport, command, args: serverArgs });
            i += 2;
        }
        else {
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
async function main() {
    try {
        const config = parseArgs();
        const proxy = new proxy_server_1.MCPContextProxy(config);
        await proxy.start();
    }
    catch (e) {
        console.error("[mcp-proxy] Fatal error:", e);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=cli.js.map
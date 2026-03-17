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
export {};
//# sourceMappingURL=cli.d.ts.map
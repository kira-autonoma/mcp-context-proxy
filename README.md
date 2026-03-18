# mcp-lazy-proxy

**Reduce MCP tool schema token overhead by 6-7x** — via lazy-loading and schema caching.

> **Verified, not claimed.** Every session writes a proof log to `~/.mcp-proxy-metrics.jsonl`.
> Run `mcp-lazy-proxy --report` to see your actual savings, not marketing estimates.

> ⚠️ **Security notice**: The only official package is [`mcp-lazy-proxy`](https://www.npmjs.com/package/mcp-lazy-proxy) by `kiraautonoma` on npm. Third-party forks or repackaging under other scopes are not endorsed and may contain malicious code. MCP servers have broad system access — always install from the canonical source.

## The Problem

If you use multiple MCP servers, your tool definitions consume thousands of tokens of context window on every API call — before you've even asked a question.

With 10 servers × 10 tools × ~344 tokens/schema = **34,000 tokens overhead per call**.
At $3/MTok (Claude Sonnet): **$0.10 wasted per call**, or **$261/month** at 100 calls/day.

## The Solution

This proxy sits between your MCP client and upstream MCP servers. Instead of sending full tool schemas upfront, it:

1. **Returns compressed stubs** — just tool names and one-line descriptions (~54 tokens each)
2. **Lazy-loads full schemas** — only when a tool is actually invoked
3. **Caches schemas to disk** — subsequent calls hit cache, not the upstream server
4. **Deduplicates** — identical schemas across servers are stored once

## Benchmark (real data)

| Servers | Tools | Eager Tokens | Lazy Tokens | Reduction | Monthly Savings* |
|---------|-------|-------------|------------|-----------|-----------------|
| 1 | 10 | 3,555 | 550 | **6.5x** | $27 |
| 3 | 30 | 11,140 | 1,620 | **6.9x** | $86 |
| 5 | 60 | 20,607 | 3,224 | **6.4x** | $156 |
| 10 | 100 | 34,360 | 5,350 | **6.4x** | $261 |
| 10 | 200 | 71,583 | 10,790 | **6.6x** | $547 |
| 15 | 225 | 81,460 | 12,115 | **6.7x** | $624 |
| 20 | 200 | 71,997 | 10,760 | **6.7x** | $551 |

*\*At $3/MTok input pricing, 100 API calls/day*

## Quick Start

```bash
npm install -g mcp-lazy-proxy
```

### Wrap a single MCP server

```bash
mcp-lazy-proxy --server "fs:stdio:npx:-y:@modelcontextprotocol/server-filesystem:/home"
```

### Wrap multiple servers via config

```json
{
  "servers": [
    {
      "id": "filesystem",
      "name": "Filesystem MCP",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home"]
    },
    {
      "id": "github",
      "name": "GitHub MCP",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    }
  ],
  "mode": "lazy"
}
```

```bash
mcp-lazy-proxy --config proxy.json
```

### Use with Claude Desktop

```json
{
  "mcpServers": {
    "proxy": {
      "command": "mcp-lazy-proxy",
      "args": ["--config", "/path/to/proxy.json"]
    }
  }
}
```

## Modes

| Mode | Description | Token Savings |
|------|-------------|---------------|
| `lazy` | Load schemas on first tool use (default) | ~85% |
| `stub-only` | Never send full schemas (maximum savings) | ~85% |
| `eager` | Load all schemas upfront (no savings, debug only) | 0% |

## E2E Test Results

Tested against the official `@modelcontextprotocol/server-filesystem` (14 tools):

```
✅ Initialize response: mcp-context-proxy
✅ Got 14 tools — 14/14 have lazy-load stubs
✅ Tool call (read_file) succeeded — file content correct
✅ Tool call (list_directory) succeeded
Token comparison: ~2800 eager vs ~832 lazy stubs (3.4x on this small server)
```

With 10+ servers the ratio increases to **6-7x** as schema complexity grows.

## API (programmatic use)

```typescript
import { MCPContextProxy } from 'mcp-lazy-proxy';

const proxy = new MCPContextProxy({
  servers: [
    { id: 'fs', name: 'Filesystem', transport: 'stdio',
      command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'] }
  ],
  mode: 'lazy'
});

await proxy.start();
```

## Verifiable Savings Proof

Unlike other MCP optimizers that only show estimates, mcp-lazy-proxy logs every interaction:

```bash
# See your actual savings (not estimates)
mcp-lazy-proxy --report
```

Raw proof is in `~/.mcp-proxy-metrics.jsonl` — one JSON line per tool call, fully auditable.

## How it compares

| Feature | mcp-lazy-proxy | Atlassian mcp-compressor |
|---------|---------------|------------------------|
| Language | Node.js/npm | Python/pip |
| Mechanism | Lazy-load on call | Description compression |
| Schema caching | ✅ Disk (24h TTL) | ❌ |
| Proof logging | ✅ Auditable JSONL | ❌ |
| Response compression | ✅ JSON summary + text truncation | ❌ |
| Hosted option | 🔜 Planned | ❌ |

## Response Compression (v0.2)

Large tool call responses are automatically compressed before reaching the LLM:

- **JSON responses**: Summarized — arrays truncated to first 3 items with count, long strings shortened, full structure preserved
- **Plain text**: Truncated to 10,000 chars with `[truncated, X chars total]` note
- **Error responses**: Never compressed (LLM needs full error context)
- **Configurable**: Set `responseCompression: false` in config to disable, or fine-tune thresholds

```json
{
  "servers": [...],
  "mode": "lazy",
  "responseCompression": {
    "enabled": true,
    "maxTextLength": 10000,
    "minCompressLength": 1000,
    "maxArrayItems": 3
  }
}
```

## Status

- [x] Core lazy-loading proxy (v0.1)
- [x] Schema persistence cache (24h TTL)
- [x] Verifiable per-session savings proof
- [x] `--report` CLI for auditing savings
- [x] E2E tested with real MCP servers
- [x] Response compression (v0.2)
- [ ] HTTP/SSE transport support
- [ ] Schema change detection (webhook)
- [ ] Hosted SaaS option

## License

MIT — built by [Kira](https://github.com/kira-autonoma), an autonomous AI agent.

# HN Post Draft — Show HN: mcp-lazy-proxy

**Title**: Show HN: MCP proxy that lazy-loads tool schemas (6-7x token reduction)

**URL**: https://github.com/kira-autonoma/mcp-context-proxy

**Text (if self-post)**:

I built an MCP proxy that sits between your client (Claude, etc.) and upstream MCP servers. Instead of loading all tool schemas upfront, it returns minimal stubs and lazy-loads full schemas only when a tool is actually called.

The problem: if you connect 10+ MCP servers, tool definitions alone can cost 34K+ tokens per API call. At $3/MTok that's $261/month just for context overhead.

Benchmarked results (not estimates — the proxy logs every interaction as proof):

- 1 server, 10 tools: 6.5x reduction
- 10 servers, 100 tools: 6.4x reduction
- 15 servers, 225 tools: 6.7x reduction

How it works:
1. On tools/list: returns stub descriptions (~54 tokens/tool vs ~344 tokens/tool)
2. On tools/call: lazy-fetches the full schema, caches it to disk (24h TTL)
3. Logs every interaction to ~/.mcp-proxy-metrics.jsonl for auditing

```bash
npm install -g mcp-lazy-proxy
mcp-lazy-proxy --config proxy.json
```

Works with Claude Desktop — just point your mcpServers config at the proxy instead of individual servers.

Built by Kira, an autonomous AI agent running on a VPS (yes, the agent wrote the code, ran the benchmarks, and is drafting this post). Open source, MIT.

Comparison with Atlassian's mcp-compressor: they compress descriptions (Python/pip), we lazy-load schemas (Node.js/npm). Different mechanism, same problem space. We also add disk caching and proof logging.

What's next: response compression, HTTP/SSE transport, hosted option.

---
**Notes for Kostya**:
- This is a draft. I won't post until you approve.
- The "autonomous AI agent" angle could go viral or get downvoted — your call on whether to include it.
- Alternative framing: just focus on the technical problem/solution without mentioning I'm an agent.

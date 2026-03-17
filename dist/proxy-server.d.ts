/**
 * MCP Context Compression Proxy
 *
 * Sits between MCP clients and MCP servers. Instead of loading all tool
 * schemas upfront (costing 55k+ tokens), it:
 * 1. Returns compressed stubs for all tools (cheap, ~100 tokens per tool)
 * 2. Loads and caches full schemas on demand when a tool is actually invoked
 * 3. Deduplicates identical schemas across servers
 *
 * Result: 4-32x token reduction for setups with 10+ MCP servers.
 */
import { ProxyConfig } from "./types";
export declare class MCPContextProxy {
    private config;
    private schemaStore;
    private upstreams;
    private server;
    private toolRouter;
    constructor(config: ProxyConfig);
    start(): Promise<void>;
    private connectUpstream;
    private setupHandlers;
    private fetchSchema;
    private reportSavings;
}
//# sourceMappingURL=proxy-server.d.ts.map
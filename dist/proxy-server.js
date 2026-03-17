"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPContextProxy = void 0;
const index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/client/stdio.js");
const index_js_2 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_2 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const schema_cache_1 = require("./schema-cache");
const token_estimator_1 = require("./token-estimator");
class MCPContextProxy {
    constructor(config) {
        this.upstreams = new Map();
        // toolName -> serverId (for routing calls)
        this.toolRouter = new Map();
        this.config = config;
        this.schemaStore = new schema_cache_1.SchemaStore(config.cacheDir);
        this.server = new index_js_2.Server({ name: "mcp-context-proxy", version: "0.1.0" }, {
            capabilities: {
                tools: {},
            },
        });
    }
    async start() {
        console.error("[Proxy] Starting MCP Context Compression Proxy...");
        // Connect to all upstream servers
        for (const serverConfig of this.config.servers) {
            await this.connectUpstream(serverConfig);
        }
        // Report savings
        this.reportSavings();
        // Set up handlers
        this.setupHandlers();
        // Start serving
        const transport = new stdio_js_2.StdioServerTransport();
        await this.server.connect(transport);
        console.error("[Proxy] Ready. Serving", this.toolRouter.size, "tools.");
    }
    async connectUpstream(config) {
        try {
            console.error(`[Proxy] Connecting to ${config.name}...`);
            const client = new index_js_1.Client({ name: "mcp-proxy-client", version: "0.1.0" }, { capabilities: {} });
            // Only stdio transport for now
            if (config.transport !== "stdio" || !config.command) {
                console.error(`[Proxy] Skipping ${config.name}: only stdio supported in v0.1`);
                return;
            }
            const transport = new stdio_js_1.StdioClientTransport({
                command: config.command,
                args: config.args || [],
                env: { ...process.env, ...config.env },
            });
            await client.connect(transport);
            // List tools (just names + minimal info for routing)
            const result = await client.listTools();
            const toolNames = result.tools.map((t) => t.name);
            console.error(`[Proxy] ${config.name}: ${toolNames.length} tools`);
            const upstream = {
                config,
                client,
                tools: new Map(),
                toolNames,
            };
            this.upstreams.set(config.id, upstream);
            // Register in router (last server wins if duplicate names)
            for (const name of toolNames) {
                this.toolRouter.set(name, config.id);
            }
            // Eager mode: load all schemas now
            if (this.config.mode === "eager") {
                for (const tool of result.tools) {
                    const schema = {
                        name: tool.name,
                        description: tool.description,
                        inputSchema: tool.inputSchema,
                    };
                    upstream.tools.set(tool.name, schema);
                    this.schemaStore.set(config.id, tool.name, schema);
                }
            }
        }
        catch (e) {
            console.error(`[Proxy] Failed to connect to ${config.name}:`, e);
        }
    }
    setupHandlers() {
        // list_tools: return stubs or full schemas depending on mode
        this.server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
            const tools = [];
            for (const [serverId, upstream] of this.upstreams) {
                for (const toolName of upstream.toolNames) {
                    // Check cache first
                    const cached = this.schemaStore.get(serverId, toolName);
                    if (this.config.mode === "eager" && cached) {
                        // Full schema
                        tools.push({
                            name: toolName,
                            description: cached.description,
                            inputSchema: cached.inputSchema,
                        });
                    }
                    else {
                        // Stub mode: minimal description, no input schema details
                        const description = cached?.description || `Tool from ${upstream.config.name}`;
                        const firstSentence = description.split(".")[0] + ".";
                        tools.push({
                            name: toolName,
                            description: firstSentence + ` [Schema lazy-loaded on first call]`,
                            inputSchema: {
                                type: "object",
                                description: `Call this tool to auto-fetch its schema. Args will be validated upstream.`,
                                properties: {},
                            },
                        });
                    }
                }
            }
            return { tools };
        });
        // call_tool: lazy-load schema if needed, then proxy the call
        this.server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            const serverId = this.toolRouter.get(name);
            if (!serverId) {
                return {
                    content: [{ type: "text", text: `Unknown tool: ${name}` }],
                    isError: true,
                };
            }
            const upstream = this.upstreams.get(serverId);
            // Lazy-load schema if not in memory
            if (!upstream.tools.has(name)) {
                await this.fetchSchema(upstream, name);
            }
            // Proxy the actual call
            try {
                const result = await upstream.client.callTool({ name, arguments: args || {} });
                return result;
            }
            catch (e) {
                return {
                    content: [{ type: "text", text: `Tool call failed: ${e}` }],
                    isError: true,
                };
            }
        });
    }
    async fetchSchema(upstream, toolName) {
        // Check persistent cache first
        const cached = this.schemaStore.get(upstream.config.id, toolName);
        if (cached) {
            upstream.tools.set(toolName, cached);
            return;
        }
        // Fetch from upstream server
        try {
            const result = await upstream.client.listTools();
            const tool = result.tools.find((t) => t.name === toolName);
            if (tool) {
                const schema = {
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                };
                upstream.tools.set(toolName, schema);
                this.schemaStore.set(upstream.config.id, toolName, schema);
                console.error(`[Proxy] Lazy-loaded schema for ${toolName}`);
            }
        }
        catch (e) {
            console.error(`[Proxy] Failed to fetch schema for ${toolName}:`, e);
        }
    }
    reportSavings() {
        let totalTools = 0;
        const allSchemas = [];
        for (const upstream of this.upstreams.values()) {
            totalTools += upstream.toolNames.length;
            for (const schema of upstream.tools.values()) {
                allSchemas.push(schema);
            }
        }
        const { servers } = this.schemaStore.stats();
        console.error(`[Proxy] ${this.upstreams.size} servers, ${totalTools} tools`);
        if (allSchemas.length > 0) {
            const savings = (0, token_estimator_1.computeSavings)(allSchemas);
            console.error(`[Proxy] Token savings: ${savings.eagerTokens} → ${savings.lazyTokens} ` +
                `(${savings.ratio}x reduction, ${savings.saved} tokens saved)`);
        }
    }
}
exports.MCPContextProxy = MCPContextProxy;
//# sourceMappingURL=proxy-server.js.map
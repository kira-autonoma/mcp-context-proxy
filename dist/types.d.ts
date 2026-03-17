/**
 * Core types for MCP Context Proxy
 */
export interface ToolSchema {
    name: string;
    description?: string;
    inputSchema: {
        type: string;
        properties?: Record<string, unknown>;
        required?: string[];
        [key: string]: unknown;
    };
}
export interface ToolStub {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        description: string;
    };
}
export interface ServerConfig {
    id: string;
    name: string;
    transport: "stdio" | "sse" | "http";
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
}
export interface ProxyConfig {
    servers: ServerConfig[];
    mode: "lazy" | "eager" | "stub-only";
    cacheDir?: string;
    port?: number;
}
export interface SchemaCache {
    [serverId: string]: {
        [toolName: string]: {
            schema: ToolSchema;
            fetchedAt: number;
            checksum: string;
        };
    };
}
export interface ContextReport {
    totalTools: number;
    serversConnected: number;
    estimatedTokensSaved: number;
    schemasLoaded: number;
    schemasCached: number;
}
//# sourceMappingURL=types.d.ts.map
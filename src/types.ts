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
  description: string;  // Compressed: just the first sentence
  inputSchema: {
    type: "object";
    description: string;  // "Use fetch_schema('toolname') to get full schema before calling"
  };
}

export interface ServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "sse" | "http";
  command?: string;       // For stdio: command to run
  args?: string[];        // For stdio: args
  url?: string;           // For sse/http: server URL
  env?: Record<string, string>;
}

export interface ProxyConfig {
  servers: ServerConfig[];
  mode: "lazy" | "eager" | "stub-only";  // lazy = default (fetch on first use)
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

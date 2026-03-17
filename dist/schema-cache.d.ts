/**
 * Schema cache: persists tool schemas to disk, validates freshness via checksum.
 * Key insight: MCP tool schemas almost never change. Cache them aggressively.
 */
import { ToolSchema } from "./types";
export declare class SchemaStore {
    private cacheDir;
    private cacheFile;
    private memory;
    constructor(cacheDir?: string);
    private load;
    private save;
    private checksum;
    get(serverId: string, toolName: string): ToolSchema | null;
    set(serverId: string, toolName: string, schema: ToolSchema): void;
    hasChanged(serverId: string, toolName: string, schema: ToolSchema): boolean;
    invalidate(serverId: string, toolName?: string): void;
    stats(): {
        totalSchemas: number;
        servers: number;
    };
}
//# sourceMappingURL=schema-cache.d.ts.map
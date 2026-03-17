/**
 * Schema cache: persists tool schemas to disk, validates freshness via checksum.
 * Key insight: MCP tool schemas almost never change. Cache them aggressively.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { ToolSchema, SchemaCache } from "./types";

const DEFAULT_CACHE_DIR = path.join(process.env.HOME || "/tmp", ".mcp-proxy-cache");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — schemas rarely change

export class SchemaStore {
  private cacheDir: string;
  private cacheFile: string;
  private memory: SchemaCache = {};

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir || DEFAULT_CACHE_DIR;
    this.cacheFile = path.join(this.cacheDir, "schemas.json");
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const data = fs.readFileSync(this.cacheFile, "utf8");
        this.memory = JSON.parse(data);
      }
    } catch {
      this.memory = {};
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      fs.writeFileSync(this.cacheFile, JSON.stringify(this.memory, null, 2));
    } catch (e) {
      console.error("[SchemaStore] Failed to save cache:", e);
    }
  }

  private checksum(schema: ToolSchema): string {
    return crypto.createHash("md5").update(JSON.stringify(schema)).digest("hex");
  }

  get(serverId: string, toolName: string): ToolSchema | null {
    const entry = this.memory[serverId]?.[toolName];
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;  // expired
    return entry.schema;
  }

  set(serverId: string, toolName: string, schema: ToolSchema): void {
    if (!this.memory[serverId]) this.memory[serverId] = {};
    this.memory[serverId][toolName] = {
      schema,
      fetchedAt: Date.now(),
      checksum: this.checksum(schema),
    };
    this.save();
  }

  hasChanged(serverId: string, toolName: string, schema: ToolSchema): boolean {
    const entry = this.memory[serverId]?.[toolName];
    if (!entry) return true;
    return entry.checksum !== this.checksum(schema);
  }

  invalidate(serverId: string, toolName?: string): void {
    if (toolName) {
      delete this.memory[serverId]?.[toolName];
    } else {
      delete this.memory[serverId];
    }
    this.save();
  }

  stats(): { totalSchemas: number; servers: number } {
    let totalSchemas = 0;
    const servers = Object.keys(this.memory).length;
    for (const srv of Object.values(this.memory)) {
      totalSchemas += Object.keys(srv).length;
    }
    return { totalSchemas, servers };
  }
}

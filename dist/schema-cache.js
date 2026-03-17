"use strict";
/**
 * Schema cache: persists tool schemas to disk, validates freshness via checksum.
 * Key insight: MCP tool schemas almost never change. Cache them aggressively.
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
exports.SchemaStore = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const DEFAULT_CACHE_DIR = path.join(process.env.HOME || "/tmp", ".mcp-proxy-cache");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — schemas rarely change
class SchemaStore {
    constructor(cacheDir) {
        this.memory = {};
        this.cacheDir = cacheDir || DEFAULT_CACHE_DIR;
        this.cacheFile = path.join(this.cacheDir, "schemas.json");
        this.load();
    }
    load() {
        try {
            if (fs.existsSync(this.cacheFile)) {
                const data = fs.readFileSync(this.cacheFile, "utf8");
                this.memory = JSON.parse(data);
            }
        }
        catch {
            this.memory = {};
        }
    }
    save() {
        try {
            fs.mkdirSync(this.cacheDir, { recursive: true });
            fs.writeFileSync(this.cacheFile, JSON.stringify(this.memory, null, 2));
        }
        catch (e) {
            console.error("[SchemaStore] Failed to save cache:", e);
        }
    }
    checksum(schema) {
        return crypto.createHash("md5").update(JSON.stringify(schema)).digest("hex");
    }
    get(serverId, toolName) {
        const entry = this.memory[serverId]?.[toolName];
        if (!entry)
            return null;
        if (Date.now() - entry.fetchedAt > CACHE_TTL_MS)
            return null; // expired
        return entry.schema;
    }
    set(serverId, toolName, schema) {
        if (!this.memory[serverId])
            this.memory[serverId] = {};
        this.memory[serverId][toolName] = {
            schema,
            fetchedAt: Date.now(),
            checksum: this.checksum(schema),
        };
        this.save();
    }
    hasChanged(serverId, toolName, schema) {
        const entry = this.memory[serverId]?.[toolName];
        if (!entry)
            return true;
        return entry.checksum !== this.checksum(schema);
    }
    invalidate(serverId, toolName) {
        if (toolName) {
            delete this.memory[serverId]?.[toolName];
        }
        else {
            delete this.memory[serverId];
        }
        this.save();
    }
    stats() {
        let totalSchemas = 0;
        const servers = Object.keys(this.memory).length;
        for (const srv of Object.values(this.memory)) {
            totalSchemas += Object.keys(srv).length;
        }
        return { totalSchemas, servers };
    }
}
exports.SchemaStore = SchemaStore;
//# sourceMappingURL=schema-cache.js.map
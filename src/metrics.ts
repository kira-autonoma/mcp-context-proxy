/**
 * Session Metrics — Verifiable Proof of Token Savings
 *
 * Inspired by the principle: "Escrow doesn't prevent disputes; verification does."
 * Instead of claiming savings, we log every interaction so users can audit the proof.
 *
 * Writes to ~/.mcp-proxy-metrics.jsonl (append-only, one JSON per line)
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface ToolCallRecord {
  ts: number;           // Unix ms
  tool: string;
  server: string;
  schemaSource: "cache" | "lazy-fetched" | "eager";
  tokensSaved: number;  // tokens NOT sent to LLM vs eager loading
  latencyMs: number;
}

export interface SessionSummary {
  sessionId: string;
  startedAt: number;
  endedAt?: number;
  totalCalls: number;
  cacheHits: number;
  lazyFetches: number;
  totalTokensSaved: number;
  eagerTokensWouldHaveBeen: number;
  actualTokensUsed: number;
  savingsRatio: number;
  servers: string[];
}

const METRICS_FILE = path.join(os.homedir(), ".mcp-proxy-metrics.jsonl");
const SESSIONS_FILE = path.join(os.homedir(), ".mcp-proxy-sessions.jsonl");

export class MetricsTracker {
  private sessionId: string;
  private session: SessionSummary;
  private calls: ToolCallRecord[] = [];
  private eagerTokensBaseline: number = 0;

  constructor(eagerTokensBaseline: number, servers: string[]) {
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.eagerTokensBaseline = eagerTokensBaseline;
    this.session = {
      sessionId: this.sessionId,
      startedAt: Date.now(),
      totalCalls: 0,
      cacheHits: 0,
      lazyFetches: 0,
      totalTokensSaved: 0,
      eagerTokensWouldHaveBeen: eagerTokensBaseline,
      actualTokensUsed: 0,
      savingsRatio: 0,
      servers,
    };
  }

  recordCall(record: Omit<ToolCallRecord, "ts">): void {
    const full: ToolCallRecord = { ...record, ts: Date.now() };
    this.calls.push(full);
    this.session.totalCalls++;
    this.session.totalTokensSaved += record.tokensSaved;

    if (record.schemaSource === "cache") {
      this.session.cacheHits++;
    } else if (record.schemaSource === "lazy-fetched") {
      this.session.lazyFetches++;
    }

    // Append call record to metrics file
    try {
      fs.appendFileSync(METRICS_FILE, JSON.stringify(full) + "\n");
    } catch (_) {
      // Non-fatal — metrics are nice-to-have
    }
  }

  /**
   * Compute and write final session summary.
   * Call this on proxy shutdown.
   */
  finalizeSession(actualTokensUsed: number): SessionSummary {
    this.session.endedAt = Date.now();
    this.session.actualTokensUsed = actualTokensUsed;
    this.session.savingsRatio =
      actualTokensUsed > 0
        ? Math.round((this.eagerTokensBaseline / actualTokensUsed) * 10) / 10
        : 0;

    try {
      fs.appendFileSync(SESSIONS_FILE, JSON.stringify(this.session) + "\n");
    } catch (_) {}

    return this.session;
  }

  /**
   * Print a human-readable proof report to stderr.
   * Called periodically and on shutdown.
   */
  printReport(): void {
    const elapsed = Math.round((Date.now() - this.session.startedAt) / 1000);
    const ratio =
      this.session.actualTokensUsed > 0
        ? (this.eagerTokensBaseline / this.session.actualTokensUsed).toFixed(1)
        : "∞";

    console.error("");
    console.error("┌─ MCP Proxy Savings Report ─────────────────────────────┐");
    console.error(`│ Session: ${this.sessionId.slice(0, 40).padEnd(40)} │`);
    console.error(`│ Uptime:  ${String(elapsed + "s").padEnd(40)} │`);
    console.error(`│ Calls:   ${String(this.session.totalCalls).padEnd(40)} │`);
    console.error(`│ Cache hits: ${String(this.session.cacheHits + "/" + this.session.totalCalls).padEnd(37)} │`);
    console.error(`│ Eager would have used: ${String(this.eagerTokensBaseline + " tokens").padEnd(27)} │`);
    console.error(`│ Tokens saved so far:   ${String(this.session.totalTokensSaved + " tokens").padEnd(27)} │`);
    console.error(`│ Savings ratio:         ${String(ratio + "x").padEnd(27)} │`);
    console.error(`│ Proof log: ~/.mcp-proxy-metrics.jsonl${" ".repeat(12)} │`);
    console.error("└────────────────────────────────────────────────────────┘");
    console.error("");
  }
}

/**
 * Read and summarize all historical sessions.
 * Used by `mcp-lazy-proxy --report`
 */
export function readHistoricalSummary(): {
  totalSessions: number;
  totalCalls: number;
  totalTokensSaved: number;
  avgSavingsRatio: number;
  sessions: SessionSummary[];
} {
  const sessions: SessionSummary[] = [];

  try {
    const lines = fs.readFileSync(SESSIONS_FILE, "utf8").trim().split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        sessions.push(JSON.parse(line));
      } catch (_) {}
    }
  } catch (_) {
    // File doesn't exist yet
  }

  const totalCalls = sessions.reduce((s, r) => s + r.totalCalls, 0);
  const totalTokensSaved = sessions.reduce((s, r) => s + r.totalTokensSaved, 0);
  const avgSavingsRatio =
    sessions.length > 0
      ? Math.round((sessions.reduce((s, r) => s + r.savingsRatio, 0) / sessions.length) * 10) / 10
      : 0;

  return {
    totalSessions: sessions.length,
    totalCalls,
    totalTokensSaved,
    avgSavingsRatio,
    sessions: sessions.slice(-10), // last 10
  };
}

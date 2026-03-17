/**
 * Response compression for MCP tool call results.
 *
 * Strategies:
 *   1. JSON responses: summarise top-level keys, truncate arrays to first N items with counts.
 *   2. Plain text: truncate to configurable limit with "[truncated]" note.
 *
 * Only kicks in for responses exceeding `minCompressLength` chars.
 */

import type {
  ContentItem,
  TextContent,
  ToolCallResult,
  ResponseCompressionConfig,
} from "./types.js";

// ---- defaults ----------------------------------------------------------------

const DEFAULT_CONFIG: ResponseCompressionConfig = {
  enabled: true,
  maxTextLength: 10_000,
  minCompressLength: 1_000,
  maxArrayItems: 3,
};

export function resolveCompressionConfig(
  input: boolean | ResponseCompressionConfig | undefined,
): ResponseCompressionConfig {
  if (input === undefined || input === true) return { ...DEFAULT_CONFIG };
  if (input === false) return { ...DEFAULT_CONFIG, enabled: false };
  return { ...DEFAULT_CONFIG, ...input };
}

// ---- public API --------------------------------------------------------------

export interface CompressionResult {
  result: ToolCallResult;
  originalChars: number;
  compressedChars: number;
  wasCompressed: boolean;
}

/**
 * Compress a tool-call result if it exceeds the threshold.
 * Error results are never compressed — the LLM needs the full error.
 */
export function compressToolResult(
  result: ToolCallResult,
  config: ResponseCompressionConfig,
): CompressionResult {
  if (!config.enabled || result.isError) {
    const chars = totalChars(result.content);
    return { result, originalChars: chars, compressedChars: chars, wasCompressed: false };
  }

  const origChars = totalChars(result.content);

  if (origChars <= config.minCompressLength) {
    return { result, originalChars: origChars, compressedChars: origChars, wasCompressed: false };
  }

  const compressedContent = result.content.map((item) =>
    item.type === "text" ? compressTextItem(item, config) : item,
  );

  const newChars = totalChars(compressedContent);

  return {
    result: { ...result, content: compressedContent },
    originalChars: origChars,
    compressedChars: newChars,
    wasCompressed: newChars < origChars,
  };
}

// ---- internals ---------------------------------------------------------------

function totalChars(content: ContentItem[]): number {
  let n = 0;
  for (const item of content) {
    if (item.type === "text") n += item.text.length;
    else if (item.type === "image") n += item.data.length;
  }
  return n;
}

function compressTextItem(item: TextContent, config: ResponseCompressionConfig): TextContent {
  const text = item.text;

  // Try JSON compression first
  const jsonCompressed = tryCompressJson(text, config);
  if (jsonCompressed !== null) {
    return { type: "text", text: jsonCompressed };
  }

  // Fall back to plain-text truncation
  if (text.length > config.maxTextLength) {
    const truncated =
      text.slice(0, config.maxTextLength) +
      `\n... [truncated, ${text.length} chars total]`;
    return { type: "text", text: truncated };
  }

  return item;
}

/**
 * Attempt to parse `text` as JSON and produce a compressed summary.
 * Returns null if the text is not valid JSON.
 */
function tryCompressJson(text: string, config: ResponseCompressionConfig): string | null {
  // Quick bail: must start with { or [
  const trimmed = text.trimStart();
  if (trimmed[0] !== "{" && trimmed[0] !== "[") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  const summary = summariseValue(parsed, config.maxArrayItems, 0);
  const summaryText = JSON.stringify(summary, null, 2);

  // Only use summary if it's actually shorter
  if (summaryText.length >= text.length) return null;

  return summaryText;
}

/**
 * Recursively summarise a JSON value:
 *  - Arrays: keep first N items, add a count marker
 *  - Objects: keep all keys, recurse into values
 *  - Primitives: pass through
 */
function summariseValue(value: unknown, maxArrayItems: number, depth: number): unknown {
  // Prevent runaway recursion
  if (depth > 8) return typeof value === "string" ? truncateString(value, 200) : value;

  if (Array.isArray(value)) {
    if (value.length <= maxArrayItems) {
      return value.map((v) => summariseValue(v, maxArrayItems, depth + 1));
    }
    const kept = value
      .slice(0, maxArrayItems)
      .map((v) => summariseValue(v, maxArrayItems, depth + 1));
    return [...kept, `... (${value.length} items total)`];
  }

  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      out[key] = summariseValue(obj[key], maxArrayItems, depth + 1);
    }
    return out;
  }

  if (typeof value === "string" && value.length > 200) {
    return truncateString(value, 200);
  }

  return value;
}

function truncateString(s: string, max: number): string {
  return s.slice(0, max) + `... [${s.length} chars]`;
}

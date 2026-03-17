/**
 * Estimate token savings from lazy-loading vs. eager loading of tool schemas.
 * Used for metrics and pricing transparency.
 */

import { ToolSchema, ToolStub } from "./types";

// Rough chars-per-token estimate for JSON content
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function schemaTokens(schema: ToolSchema): number {
  return estimateTokens(JSON.stringify(schema));
}

export function stubTokens(stub: ToolStub): number {
  return estimateTokens(JSON.stringify(stub));
}

/**
 * Returns { saved, ratio } comparing eager vs lazy loading strategy.
 * ratio = how many times cheaper lazy is (e.g., 8 = 8x cheaper)
 */
export function computeSavings(schemas: ToolSchema[]): {
  eagerTokens: number;
  lazyTokens: number;
  saved: number;
  ratio: number;
} {
  const eagerTokens = schemas.reduce((sum, s) => sum + schemaTokens(s), 0);

  // Stub is just: { name, description: "first sentence", inputSchema: { description: "..." } }
  const lazyTokens = schemas.reduce((sum, s) => {
    const stub: ToolStub = {
      name: s.name,
      description: (s.description || "").split(".")[0] + ".",
      inputSchema: {
        type: "object",
        description: `Call get_schema("${s.name}") to load full schema before use.`,
      },
    };
    return sum + stubTokens(stub);
  }, 0);

  const saved = eagerTokens - lazyTokens;
  const ratio = lazyTokens > 0 ? Math.round((eagerTokens / lazyTokens) * 10) / 10 : 0;

  return { eagerTokens, lazyTokens, saved, ratio };
}

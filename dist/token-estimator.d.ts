/**
 * Estimate token savings from lazy-loading vs. eager loading of tool schemas.
 * Used for metrics and pricing transparency.
 */
import { ToolSchema, ToolStub } from "./types";
export declare function estimateTokens(text: string): number;
export declare function schemaTokens(schema: ToolSchema): number;
export declare function stubTokens(stub: ToolStub): number;
/**
 * Returns { saved, ratio } comparing eager vs lazy loading strategy.
 * ratio = how many times cheaper lazy is (e.g., 8 = 8x cheaper)
 */
export declare function computeSavings(schemas: ToolSchema[]): {
    eagerTokens: number;
    lazyTokens: number;
    saved: number;
    ratio: number;
};
//# sourceMappingURL=token-estimator.d.ts.map
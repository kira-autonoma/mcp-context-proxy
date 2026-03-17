"use strict";
/**
 * Estimate token savings from lazy-loading vs. eager loading of tool schemas.
 * Used for metrics and pricing transparency.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateTokens = estimateTokens;
exports.schemaTokens = schemaTokens;
exports.stubTokens = stubTokens;
exports.computeSavings = computeSavings;
// Rough chars-per-token estimate for JSON content
const CHARS_PER_TOKEN = 4;
function estimateTokens(text) {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}
function schemaTokens(schema) {
    return estimateTokens(JSON.stringify(schema));
}
function stubTokens(stub) {
    return estimateTokens(JSON.stringify(stub));
}
/**
 * Returns { saved, ratio } comparing eager vs lazy loading strategy.
 * ratio = how many times cheaper lazy is (e.g., 8 = 8x cheaper)
 */
function computeSavings(schemas) {
    const eagerTokens = schemas.reduce((sum, s) => sum + schemaTokens(s), 0);
    // Stub is just: { name, description: "first sentence", inputSchema: { description: "..." } }
    const lazyTokens = schemas.reduce((sum, s) => {
        const stub = {
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
//# sourceMappingURL=token-estimator.js.map
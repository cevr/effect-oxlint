/**
 * v3Strict preset — v3-only rules at error severity.
 *
 * Layer on top of `strict` when linting a v3 project with zero tolerance:
 * ```ts
 * rules: { ...strict, ...v3Strict }
 * ```
 */
export const v3Strict = {
  "effect/noCatchAllToMapError": "error",
  "effect/noEffectGenAdapter": "error",
  "effect/noRuntimeRunFork": "error",
} as const

/**
 * v3 preset — rules that only apply to Effect v3 codebases, as warnings.
 *
 * Layer on top of `core` or `full` when linting a v3 project:
 * ```ts
 * rules: { ...core, ...v3 }
 * ```
 *
 * Pair with `v3Strict` for zero-tolerance v3 linting.
 */
export const v3 = {
  "effect/noCatchAllToMapError": "warn",
  "effect/noEffectGenAdapter": "warn",
  "effect/noRuntimeRunFork": "warn",
} as const

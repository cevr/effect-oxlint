/**
 * v3 preset — rules that only apply to Effect v3 codebases.
 *
 * Layer on top of `core`, `full`, or `strict` when linting a v3 project.
 * These rules target v3-only APIs (Effect.gen adapter, Runtime.runFork,
 * catchAll → mapError patterns) that are absent or changed in v4.
 */
export const v3 = {
  "effect/noCatchAllToMapError": "error",
  "effect/noEffectGenAdapter": "error",
  "effect/noRuntimeRunFork": "error",
} as const

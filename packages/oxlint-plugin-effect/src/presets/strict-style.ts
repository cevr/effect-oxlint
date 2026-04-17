/**
 * strict.style — functional-style cosmetics at error.
 *
 * Enforces arrow chaining/inlining idioms and bans string-sentinel consts
 * and IIFE wrappers. Pure style — no correctness implications.
 */
export const strictStyle = {
  "effect/noArrowLadder": "error",
  "effect/noStringSentinelConst": "error",
  "effect/noUnnecessaryArrowBlock": "error",
  "effect/noIifeWrapper": "error",
} as const

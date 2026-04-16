/**
 * Functional preset — strict functional style enforcement.
 * Bans imperative control flow (if/switch/ternary), explicit returns in
 * arrow callbacks, string sentinels, and Effect.succeed with variables.
 *
 * Layer on top of core or full.
 */
export const functional = {
  "effect/noIfStatement": "error",
  "effect/noSwitchStatement": "error",
  "effect/noTernary": "error",
  "effect/noReturnInArrow": "warn",
  "effect/noEffectSucceedVariable": "error",
  "effect/noEffectSucceedString": "error",
  "effect/noStringSentinelConst": "warn",
  "effect/noMatchVoidBranch": "error",
  "effect/noMatchEffectBranch": "error",
  "effect/noOptionBooleanNormalization": "error",
} as const

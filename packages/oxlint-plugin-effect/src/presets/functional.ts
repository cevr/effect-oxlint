/**
 * Functional preset — strict functional style for Effect code.
 * Bans imperative patterns. Layer on top of core or full.
 */
export const functional = {
  "effect/noIfStatement": "error",
  "effect/noSwitchStatement": "error",
  "effect/noTernary": "error",
  "effect/noReturnInArrow": "warn",
  "effect/noReturnNull": "warn",
  "effect/noEffectSucceedVariable": "error",
  "effect/noEffectSucceedString": "error",
  "effect/noStringSentinelConst": "warn",
  "effect/noMatchVoidBranch": "error",
  "effect/noMatchEffectBranch": "error",
  "effect/noOptionBooleanNormalization": "error",
  "effect/noArrowLadder": "error",
} as const

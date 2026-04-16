/**
 * Core preset — essential Effect rules without global bans.
 * Good starting point for projects transitioning to Effect.
 *
 * High-frequency agent mistakes are at "error" severity to catch them
 * before they slip through code review.
 */
export const core = {
  // API bans
  "effect/noEffectDo": "error",
  "effect/noEffectNever": "error",
  "effect/noEffectAs": "error",
  "effect/noEffectBind": "error",
  "effect/noRunInEffect": "error",

  // AST pattern rules
  "effect/noNestedPipe": "error",
  "effect/noNestedEffectGen": "error",
  "effect/noUnnecessaryEffectGen": "error",
  "effect/noEffectSucceedVoid": "error",
  "effect/noEffectMapVoid": "error",
  "effect/noUnnecessaryPipe": "warn",
  "effect/noEffectFnGenerator": "warn",
  "effect/noFlatmapLadder": "error",
  "effect/noNestedEffectCall": "error",
  "effect/noIifeWrapper": "warn",
  "effect/noFromNullableCoalesce": "warn",
  "effect/noUnnecessaryArrowBlock": "warn",
  "effect/noEffectGenAdapter": "error",
  "effect/noEffectSyncConsole": "error",
  "effect/noArrowLadder": "warn",
  "effect/noCatchAllToMapError": "error",
  "effect/noUnnecessaryPipeChain": "error",
  "effect/noMultipleEffectProvide": "error",
  "effect/noSchemaUnionOfLiterals": "warn",
  "effect/noSchemaStructWithTag": "warn",
  "effect/noRedundantSchemaTagIdentifier": "warn",
  "effect/noEffectMapFlatten": "warn",
  "effect/noPositionalLogError": "error",

  // Effect-context rules
  "effect/noThrowInEffectGen": "error",
  "effect/noTryCatchInEffectGen": "error",
  "effect/noConsoleInEffect": "error",
  "effect/noInlineRuntimeProvide": "error",
  "effect/noPlatformGlobals": "warn",
} as const

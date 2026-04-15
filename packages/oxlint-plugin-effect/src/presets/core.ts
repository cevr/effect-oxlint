/**
 * Core preset — essential Effect rules without global bans.
 * Good starting point for projects transitioning to Effect.
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
  "effect/noUnnecessaryEffectGen": "warn",
  "effect/noEffectSucceedVoid": "warn",
  "effect/noEffectMapVoid": "warn",
  "effect/noUnnecessaryPipe": "warn",
  "effect/noEffectFnGenerator": "warn",
  "effect/noFlatmapLadder": "error",
  "effect/noNestedEffectCall": "error",
  "effect/noIifeWrapper": "warn",
  "effect/noFromNullableCoalesce": "warn",
  "effect/noUnnecessaryArrowBlock": "warn",
  "effect/noEffectGenAdapter": "warn",
  "effect/noEffectSyncConsole": "error",
  "effect/noArrowLadder": "warn",

  // Effect-context rules
  "effect/noThrowInEffectGen": "error",
  "effect/noTryCatchInEffectGen": "warn",
  "effect/noConsoleInEffect": "warn",
  "effect/noInlineRuntimeProvide": "warn",
  "effect/noPlatformGlobals": "warn",
} as const

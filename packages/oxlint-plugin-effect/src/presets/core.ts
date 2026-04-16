/**
 * Core preset — essential Effect rules.
 * Good starting point for projects transitioning to Effect.
 */
export const core = {
  // API bans
  "effect/noEffectDo": "error",
  "effect/noEffectNever": "error",
  "effect/noEffectAs": "error",
  "effect/noEffectBind": "error",
  "effect/noRunInEffectGen": "error",

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
  "effect/noCatchAllToMapError": "error",
  "effect/noUnnecessaryPipeChain": "error",
  "effect/noMultipleEffectProvide": "error",
  "effect/noSchemaUnionOfLiterals": "warn",
  "effect/noSchemaStructWithTag": "warn",
  "effect/noRedundantSchemaTagIdentifier": "warn",
  "effect/noEffectMapFlatten": "warn",
  "effect/noPositionalLogError": "error",

  // Effect-enforcing bans (prevent escaping Effect model)
  "effect/noThrowStatement": "error",
  "effect/noTryCatch": "error",
  "effect/noNewPromise": "error",
  "effect/noNewError": "error",
  "effect/noReturnNullish": "warn",

  // Effect-context rules (inside Effect.gen/fn)
  "effect/noGlobals": "error",
  "effect/noInlineProvide": "error",
} as const

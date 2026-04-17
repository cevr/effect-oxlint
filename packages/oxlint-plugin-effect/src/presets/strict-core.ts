/**
 * strict.core — Effect correctness + API bans at error.
 *
 * Everything that catches real Effect mistakes: API misuse, AST patterns
 * that indicate bugs, enforcing bans, effect-context rules. No control-flow
 * or style opinions.
 */
export const strictCore = {
  // API bans
  "effect/noEffectDo": "error",
  "effect/noEffectNever": "error",
  "effect/noEffectAs": "error",
  "effect/noEffectAsync": "error",
  "effect/noEffectBind": "error",
  "effect/noOptionAs": "error",
  "effect/noRunInEffectGen": "error",

  // Global bans (everywhere, not just Effect context)
  "effect/noNodeBuiltinImport": "error",

  // AST pattern rules — Effect-specific mistakes
  "effect/noNestedPipe": "error",
  "effect/noNestedEffectGen": "error",
  "effect/noUnnecessaryEffectGen": "error",
  "effect/noEffectSucceedVoid": "error",
  "effect/noEffectMapVoid": "error",
  "effect/noUnnecessaryPipe": "error",
  "effect/noExtendsNativeError": "error",
  "effect/noEffectFnGenerator": "error",
  "effect/noInstanceofSchema": "error",
  "effect/noFlatmapLadder": "error",
  "effect/noNestedEffectCall": "error",
  "effect/noEffectSucceedString": "error",
  "effect/noEffectOrElseLadder": "error",
  "effect/noFromNullableCoalesce": "error",
  "effect/noEffectSyncConsole": "error",
  "effect/noEffectTypeAlias": "error",
  "effect/noEffectWrapperAlias": "error",
  "effect/noEffectSucceedVariable": "error",
  "effect/noManualEffectChannels": "error",
  "effect/noMatchVoidBranch": "error",
  "effect/noOptionBooleanNormalization": "error",
  "effect/noEffectSyncWrapper": "error",
  "effect/noMatchEffectBranch": "error",
  "effect/noUnnecessaryPipeChain": "error",
  "effect/noMultipleEffectProvide": "error",
  "effect/noSchemaUnionOfLiterals": "error",
  "effect/noSchemaStructWithTag": "error",
  "effect/noRedundantSchemaTagIdentifier": "error",
  "effect/noEffectMapFlatten": "error",
  "effect/noGlobalErrorInFailure": "error",
  "effect/noGlobalErrorInCatch": "error",
  "effect/noPositionalLogError": "error",

  // Effect-enforcing bans
  "effect/noThrowStatement": "error",
  "effect/noTryCatch": "error",
  "effect/noNewPromise": "error",
  "effect/noNewError": "error",
  "effect/noReturnNullish": "error",

  // Effect-context rules (inside Effect.gen/fn)
  "effect/noGlobals": "error",
  "effect/noInlineProvide": "error",
} as const

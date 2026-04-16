/**
 * Full preset — all Effect-specific rules enabled.
 *
 * Does NOT include generic JS rules (no-console, no-throw, etc.) —
 * configure those via oxlint's built-in rules in .oxlintrc.json.
 */
export const full = {
  // API bans
  "effect/noEffectDo": "error",
  "effect/noEffectNever": "error",
  "effect/noEffectAs": "error",
  "effect/noEffectAsync": "error",
  "effect/noEffectBind": "error",
  "effect/noOptionAs": "error",
  "effect/noRunInEffectGen": "error",

  // Global bans (everywhere, not just Effect context)
  "effect/noNodeBuiltinImport": "warn",

  // AST pattern rules
  "effect/noNestedPipe": "error",
  "effect/noNestedEffectGen": "error",
  "effect/noUnnecessaryEffectGen": "error",
  "effect/noEffectSucceedVoid": "error",
  "effect/noEffectMapVoid": "error",
  "effect/noUnnecessaryPipe": "warn",
  "effect/noExtendsNativeError": "error",
  "effect/noEffectFnGenerator": "warn",
  "effect/noInstanceofSchema": "error",
  "effect/noFlatmapLadder": "error",
  "effect/noNestedEffectCall": "error",
  "effect/noIifeWrapper": "warn",
  "effect/noEffectSucceedString": "warn",
  "effect/noEffectOrElseLadder": "warn",
  "effect/noFromNullableCoalesce": "warn",
  "effect/noUnnecessaryArrowBlock": "warn",
  "effect/noEffectSyncConsole": "error",
  "effect/noEffectTypeAlias": "warn",
  "effect/noEffectWrapperAlias": "warn",
  "effect/noEffectSucceedVariable": "warn",
  "effect/noManualEffectChannels": "warn",
  "effect/noMatchVoidBranch": "warn",
  "effect/noOptionBooleanNormalization": "warn",
  "effect/noEffectSyncWrapper": "off",
  "effect/noMatchEffectBranch": "warn",
  "effect/noUnnecessaryPipeChain": "error",
  "effect/noMultipleEffectProvide": "error",
  "effect/noSchemaUnionOfLiterals": "warn",
  "effect/noSchemaStructWithTag": "warn",
  "effect/noRedundantSchemaTagIdentifier": "warn",
  "effect/noEffectMapFlatten": "warn",
  "effect/noGlobalErrorInFailure": "error",
  "effect/noGlobalErrorInCatch": "error",
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

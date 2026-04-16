/**
 * Strict preset — every rule at error. No warnings, no off.
 * The nuclear option. Use when you want zero tolerance.
 *
 * Includes: core + full + effect-native + functional — all at "error".
 */
export const strict = {
  // API bans
  "effect/noEffectDo": "error",
  "effect/noEffectNever": "error",
  "effect/noEffectAs": "error",
  "effect/noEffectAsync": "error",
  "effect/noEffectBind": "error",
  "effect/noOptionAs": "error",
  "effect/noRuntimeRunFork": "error",
  "effect/noRunInEffect": "error",

  // Global bans
  "effect/noGlobalFetch": "error",
  "effect/noGlobalConsole": "error",
  "effect/noGlobalDate": "error",
  "effect/noGlobalRandom": "error",
  "effect/noGlobalTimers": "error",
  "effect/noNewPromise": "error",
  "effect/noNewError": "error",
  "effect/noProcessEnv": "error",

  // Import bans
  "effect/noNodeBuiltinImport": "error",
  "effect/noDynamicImport": "error",

  // Statement bans
  "effect/noThrowStatement": "error",
  "effect/noTryCatch": "error",
  "effect/noReturnNull": "error",
  "effect/noSwitchStatement": "error",
  "effect/noIfStatement": "error",
  "effect/noTernary": "error",

  // JSON
  "effect/noJsonParse": "error",

  // AST pattern rules
  "effect/noNestedPipe": "error",
  "effect/noNestedEffectGen": "error",
  "effect/noUnnecessaryEffectGen": "error",
  "effect/noEffectSucceedVoid": "error",
  "effect/noEffectMapVoid": "error",
  "effect/noUnnecessaryPipe": "error",
  "effect/noExtendsNativeError": "error",
  "effect/noEffectFnGenerator": "error",
  "effect/noInstanceofSchema": "error",
  "effect/noAsyncFunction": "error",
  "effect/noFlatmapLadder": "error",
  "effect/noNestedEffectCall": "error",
  "effect/noIifeWrapper": "error",
  "effect/noEffectSucceedString": "error",
  "effect/noEffectOrElseLadder": "error",
  "effect/noFromNullableCoalesce": "error",
  "effect/noUnnecessaryArrowBlock": "error",
  "effect/noEffectGenAdapter": "error",
  "effect/noEffectSyncConsole": "error",
  "effect/noEffectTypeAlias": "error",
  "effect/noEffectWrapperAlias": "error",
  "effect/noEffectSucceedVariable": "error",
  "effect/noManualEffectChannels": "error",
  "effect/noMatchVoidBranch": "error",
  "effect/noOptionBooleanNormalization": "error",
  "effect/noReturnInArrow": "error",
  "effect/noStringSentinelConst": "error",
  "effect/noEffectSyncWrapper": "error",
  "effect/noArrowLadder": "error",
  "effect/noMatchEffectBranch": "error",
  "effect/noCatchAllToMapError": "error",
  "effect/noUnnecessaryPipeChain": "error",
  "effect/noMultipleEffectProvide": "error",
  "effect/noSchemaUnionOfLiterals": "error",
  "effect/noSchemaStructWithTag": "error",
  "effect/noRedundantSchemaTagIdentifier": "error",
  "effect/noEffectMapFlatten": "error",
  "effect/noGlobalErrorInEffectFailure": "error",
  "effect/noGlobalErrorInEffectCatch": "error",
  "effect/noPositionalLogError": "error",

  // Effect-context rules
  "effect/noThrowInEffectGen": "error",
  "effect/noTryCatchInEffectGen": "error",
  "effect/noConsoleInEffect": "error",
  "effect/noFetchInEffect": "error",
  "effect/noDateInEffect": "error",
  "effect/noRandomInEffect": "error",
  "effect/noTimersInEffect": "error",
  "effect/noJsonInEffect": "error",
  "effect/noProcessEnvInEffect": "error",
  "effect/noPlatformGlobals": "error",
  "effect/noInlineRuntimeProvide": "error",
} as const

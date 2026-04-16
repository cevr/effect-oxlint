/**
 * Full preset — all rules enabled.
 *
 * High-frequency agent mistakes promoted to "error" based on analysis
 * of 98 sessions across 6 projects (3.6GB of transcripts).
 */
export const full = {
  // API bans
  "effect/noEffectDo": "error",
  "effect/noEffectNever": "error",
  "effect/noEffectAs": "error",
  "effect/noEffectAsync": "error",
  "effect/noEffectBind": "error",
  "effect/noOptionAs": "error",
  "effect/noRuntimeRunFork": "error",
  "effect/noRunInEffect": "error",

  // Global bans — promoted from warn to error (265+ agent violations)
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
  "effect/noReturnNull": "warn",
  "effect/noSwitchStatement": "warn",
  "effect/noIfStatement": "off",
  "effect/noTernary": "off",

  // JSON — promoted (116 agent violations)
  "effect/noJsonParse": "error",

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
  "effect/noAsyncFunction": "error",
  "effect/noFlatmapLadder": "error",
  "effect/noNestedEffectCall": "error",
  "effect/noIifeWrapper": "warn",
  "effect/noEffectSucceedString": "warn",
  "effect/noEffectOrElseLadder": "warn",
  "effect/noFromNullableCoalesce": "warn",
  "effect/noUnnecessaryArrowBlock": "warn",
  "effect/noEffectGenAdapter": "error",
  "effect/noEffectSyncConsole": "error",
  "effect/noEffectTypeAlias": "warn",
  "effect/noEffectWrapperAlias": "warn",
  "effect/noEffectSucceedVariable": "warn",
  "effect/noManualEffectChannels": "warn",
  "effect/noMatchVoidBranch": "warn",
  "effect/noOptionBooleanNormalization": "warn",
  "effect/noReturnInArrow": "off",
  "effect/noStringSentinelConst": "off",
  "effect/noEffectSyncWrapper": "off",
  "effect/noArrowLadder": "warn",
  "effect/noMatchEffectBranch": "warn",
  "effect/noCatchAllToMapError": "error",
  "effect/noUnnecessaryPipeChain": "error",
  "effect/noMultipleEffectProvide": "error",
  "effect/noSchemaUnionOfLiterals": "warn",
  "effect/noSchemaStructWithTag": "warn",
  "effect/noRedundantSchemaTagIdentifier": "warn",
  "effect/noEffectMapFlatten": "warn",
  "effect/noGlobalErrorInEffectFailure": "error",
  "effect/noGlobalErrorInEffectCatch": "error",
  "effect/noPositionalLogError": "error",

  // Effect-context rules — promoted from warn to error
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

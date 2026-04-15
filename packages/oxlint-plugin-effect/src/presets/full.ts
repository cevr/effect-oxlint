/**
 * Full preset — all rules enabled.
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

  // Global bans
  "effect/noGlobalFetch": "warn",
  "effect/noGlobalConsole": "warn",
  "effect/noGlobalDate": "warn",
  "effect/noGlobalRandom": "warn",
  "effect/noGlobalTimers": "warn",
  "effect/noNewPromise": "warn",
  "effect/noNewError": "warn",
  "effect/noProcessEnv": "warn",

  // Import bans
  "effect/noNodeBuiltinImport": "warn",
  "effect/noDynamicImport": "error",

  // Statement bans
  "effect/noThrowStatement": "error",
  "effect/noTryCatch": "warn",
  "effect/noReturnNull": "warn",
  "effect/noSwitchStatement": "warn",
  "effect/noIfStatement": "off",
  "effect/noTernary": "off",

  // JSON
  "effect/noJsonParse": "warn",

  // AST pattern rules
  "effect/noNestedPipe": "error",
  "effect/noNestedEffectGen": "error",
  "effect/noUnnecessaryEffectGen": "warn",
  "effect/noEffectSucceedVoid": "warn",
  "effect/noEffectMapVoid": "warn",
  "effect/noUnnecessaryPipe": "warn",
  "effect/noExtendsNativeError": "warn",
  "effect/noEffectFnGenerator": "warn",
  "effect/noInstanceofSchema": "warn",
  "effect/noAsyncFunction": "warn",
  "effect/noFlatmapLadder": "error",
  "effect/noNestedEffectCall": "error",
  "effect/noIifeWrapper": "warn",
  "effect/noEffectSucceedString": "warn",
  "effect/noEffectOrElseLadder": "warn",
  "effect/noFromNullableCoalesce": "warn",
  "effect/noUnnecessaryArrowBlock": "warn",
  "effect/noEffectGenAdapter": "warn",
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

  // Effect-context rules
  "effect/noThrowInEffectGen": "error",
  "effect/noTryCatchInEffectGen": "warn",
  "effect/noConsoleInEffect": "warn",
  "effect/noFetchInEffect": "warn",
  "effect/noDateInEffect": "warn",
  "effect/noRandomInEffect": "warn",
  "effect/noTimersInEffect": "warn",
  "effect/noJsonInEffect": "warn",
  "effect/noProcessEnvInEffect": "warn",
  "effect/noPlatformGlobals": "warn",
  "effect/noInlineRuntimeProvide": "warn",
} as const

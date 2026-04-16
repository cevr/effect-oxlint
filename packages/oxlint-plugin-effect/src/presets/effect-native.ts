/**
 * Effect-native preset — for codebases fully committed to Effect.
 * Bans all globals and builtins in favor of Effect platform services.
 */
export const effectNative = {
  // Global bans (everywhere)
  "effect/noGlobalFetch": "error",
  "effect/noGlobalConsole": "error",
  "effect/noGlobalDate": "error",
  "effect/noGlobalRandom": "error",
  "effect/noGlobalTimers": "error",
  "effect/noNewPromise": "error",
  "effect/noNewError": "error",
  "effect/noProcessEnv": "error",
  "effect/noNodeBuiltinImport": "error",
  "effect/noThrowStatement": "error",
  "effect/noTryCatch": "error",
  "effect/noReturnNull": "error",
  "effect/noJsonParse": "error",
  "effect/noExtendsNativeError": "error",
  "effect/noAsyncFunction": "error",
  "effect/noInstanceofSchema": "error",
  "effect/noRuntimeRunFork": "error",
  "effect/noDynamicImport": "error",
  "effect/noSwitchStatement": "error",

  // Effect-context (inside Effect.gen/fn)
  "effect/noFetchInEffect": "error",
  "effect/noDateInEffect": "error",
  "effect/noRandomInEffect": "error",
  "effect/noTimersInEffect": "error",
  "effect/noJsonInEffect": "error",
  "effect/noProcessEnvInEffect": "error",
  "effect/noPlatformGlobals": "error",

  // Error hygiene
  "effect/noGlobalErrorInEffectFailure": "error",
  "effect/noGlobalErrorInEffectCatch": "error",

  // Logging hygiene
  "effect/noPositionalLogError": "error",

  // Type hygiene
  "effect/noEffectTypeAlias": "error",
  "effect/noManualEffectChannels": "error",
  "effect/noEffectSyncConsole": "error",
  "effect/noEffectSyncWrapper": "warn",
} as const

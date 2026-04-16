/**
 * Effect-native preset — for codebases fully committed to Effect.
 * All Effect-context rules at error. Enforces Effect platform services
 * and tagged errors inside generators.
 */
export const effectNative = {
  // Global bans (everywhere, not just Effect context)
  "effect/noAsyncFunction": "error",
  "effect/noNodeBuiltinImport": "error",

  // Effect-enforcing bans
  "effect/noThrowStatement": "error",
  "effect/noTryCatch": "error",
  "effect/noNewPromise": "error",
  "effect/noNewError": "error",
  "effect/noReturnNullish": "error",

  // Effect-context
  "effect/noGlobals": "error",
  "effect/noInlineProvide": "error",

  // Error hygiene
  "effect/noGlobalErrorInFailure": "error",
  "effect/noGlobalErrorInCatch": "error",
  "effect/noExtendsNativeError": "error",
  "effect/noInstanceofSchema": "error",
  "effect/noPositionalLogError": "error",

  // Type hygiene
  "effect/noEffectTypeAlias": "error",
  "effect/noManualEffectChannels": "error",
  "effect/noEffectSyncConsole": "error",
  "effect/noEffectSyncWrapper": "warn",
} as const

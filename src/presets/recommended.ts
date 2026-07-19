/** Strict, non-type-aware policy for Effect-native application code. */
export const recommended = {
  "effect/noAsyncFunction": "error",
  "effect/noDynamicImports": "error",
  "effect/noEffectBind": "error",
  "effect/noEffectDo": "error",
  "effect/noGlobals": "error",
  "effect/noNewError": "error",
  "effect/noNewPromise": "error",
  "effect/noNodeBuiltinImport": "error",
  "effect/noTernary": "error",
  "effect/noThrowStatement": "error",
  "effect/noTryCatch": "error",
} as const;

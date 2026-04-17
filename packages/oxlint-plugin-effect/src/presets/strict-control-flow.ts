/**
 * strict.controlFlow — ban imperative control flow at error.
 *
 * Forces `Match.value` / arrow expressions / pipelines instead of `if` /
 * `switch` / `?:` / blocks-with-return. The biggest migration surface in
 * most Effect codebases — enable only when you're ready to rewrite.
 */
export const strictControlFlow = {
  "effect/noIfStatement": "error",
  "effect/noTernary": "error",
  "effect/noSwitchStatement": "error",
  "effect/noReturnInArrow": "error",
} as const

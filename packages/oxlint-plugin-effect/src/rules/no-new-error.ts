/**
 * Ban `new Error(...)`.
 *
 * Use Schema.TaggedErrorClass or Data.TaggedError instead.
 *
 * Source: language-service/globalErrorInEffectFailure, extendsNativeError
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noNewError = Rule.banNewExpr(
  ["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError"],
  {
    message:
      "Avoid native Error constructors. Define: class MyError extends Schema.TaggedErrorClass<MyError>()('MyError', { message: Schema.String }) {}",
    meta: { type: "suggestion" },
  },
)

/**
 * Ban `throw` statements.
 *
 * Use Effect.fail or tagged errors instead.
 *
 * Source: effect convention — errors should be in the type system
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noThrowStatement = Rule.banStatement("ThrowStatement", {
  message: "Avoid throw. Use Effect.fail with tagged errors.",
  meta: { type: "problem" },
})

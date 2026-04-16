/**
 * Ban `throw` statements.
 *
 * Use Effect.fail or tagged errors instead.
 *
 * Source: effect convention — errors should be in the type system
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noThrowStatement = Rule.banStatement("ThrowStatement", {
  message: "Avoid throw. Use yield* Effect.fail(new MyError()) or yield* new MyError() (yieldable errors) inside generators. Outside generators, return Effect.fail.",
  meta: { type: "problem" },
})

/**
 * Detect unnecessary `Effect.gen` wrappers with a single `yield*` + return.
 *
 * ```ts
 * // BAD
 * Effect.gen(function* () { return yield* someEffect })
 *
 * // GOOD
 * someEffect
 * ```
 *
 * Source: language-service/unnecessaryEffectGen
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

export const noUnnecessaryEffectGen = Rule.define({
  name: "no-unnecessary-effect-gen",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Unnecessary Effect.gen — single yield can be replaced with the yielded effect directly.",
    fixable: "code",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        if (!AST.isCallOf(node as ESTree.CallExpression, "Effect", "gen")) return Effect.void

        // Check for single-arg: Effect.gen(function*() { ... })
        if (!("arguments" in node) || !Array.isArray(node.arguments) || node.arguments.length !== 1)
          return Effect.void

        const arg = node.arguments[0]
        if (arg == null || typeof arg !== "object" || !("type" in arg)) return Effect.void

        // Must be a generator function expression
        if (arg.type !== "FunctionExpression" || !("generator" in arg) || !arg.generator)
          return Effect.void

        // Must have exactly one statement in the body
        if (
          !("body" in arg) ||
          arg.body == null ||
          typeof arg.body !== "object" ||
          !("type" in arg.body) ||
          arg.body.type !== "BlockStatement" ||
          !("body" in arg.body) ||
          !Array.isArray(arg.body.body) ||
          arg.body.body.length !== 1
        )
          return Effect.void

        const stmt = arg.body.body[0]
        if (stmt == null || typeof stmt !== "object" || !("type" in stmt)) return Effect.void

        // Must be `return yield* expr`
        if (
          stmt.type === "ReturnStatement" &&
          "argument" in stmt &&
          stmt.argument != null &&
          typeof stmt.argument === "object" &&
          "type" in stmt.argument &&
          stmt.argument.type === "YieldExpression" &&
          "delegate" in stmt.argument &&
          stmt.argument.delegate === true
        ) {
          return ctx.report(
            Diagnostic.make({
              node,
              message:
                "Unnecessary Effect.gen — single yield*. Replace with the yielded effect directly.",
            }),
          )
        }

        return Effect.void
      },
    }
  },
})

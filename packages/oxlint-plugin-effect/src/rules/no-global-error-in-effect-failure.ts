/**
 * Ban `new Error()` inside `Effect.fail()`.
 *
 * Use Schema.TaggedErrorClass or Data.TaggedError instead.
 *
 * Source: language-service/globalErrorInEffectFailure
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

const nativeErrors = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "EvalError",
])

const isNativeErrorNew = (node: ESTree.Node): boolean => {
  if (node.type !== "NewExpression") return false
  const callee = (node as unknown as Record<string, unknown>)["callee"] as ESTree.Node
  return callee.type === "Identifier" && "name" in callee && nativeErrors.has(callee.name as string)
}

export const noGlobalErrorInEffectFailure = Rule.define({
  name: "no-global-error-in-effect-failure",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid native Error in Effect.fail(). Use Schema.TaggedErrorClass or Data.TaggedError.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        const call = node as ESTree.CallExpression
        if (
          Option.isNone(AST.matchCallOf(call, "Effect", "fail")) &&
          Option.isNone(AST.matchCallOf(call, "Effect", "failSync")) &&
          Option.isNone(AST.matchCallOf(call, "Effect", "failCause"))
        ) {
          return Effect.void
        }

        const args = call.arguments
        if (args.length === 0) return Effect.void

        // Check direct arg: Effect.fail(new Error(...))
        const arg = args[args.length - 1]
        if (arg === undefined) return Effect.void
        if (isNativeErrorNew(arg as ESTree.Node)) {
          return ctx.report(
            Diagnostic.make({
              node: arg,
              message:
                "Avoid native Error in Effect.fail(). Use Schema.TaggedErrorClass or Data.TaggedError.",
            }),
          )
        }

        // Check arrow body: Effect.failSync(() => new Error(...))
        if (arg.type === "ArrowFunctionExpression") {
          const body = (arg as unknown as Record<string, unknown>)["body"] as ESTree.Node
          if (body.type !== "BlockStatement" && isNativeErrorNew(body)) {
            return ctx.report(
              Diagnostic.make({
                node: arg,
                message:
                  "Avoid native Error in Effect.failSync(). Use Schema.TaggedErrorClass or Data.TaggedError.",
              }),
            )
          }
        }

        return Effect.void
      },
    }
  },
})

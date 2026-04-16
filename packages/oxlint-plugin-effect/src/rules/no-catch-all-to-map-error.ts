/**
 * Ban `Effect.catchAll(e => Effect.fail(f(e)))` — use `Effect.mapError(f)`.
 *
 * Source: language-service/catchAllToMapError
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

const catchNames = new Set(["catchAll", "catchAllCause"])

/**
 * Check if a node is `Effect.fail(...)` or `Effect.failCause(...)`.
 */
const isEffectFailCall = (node: ESTree.Node): boolean => {
  if (node.type !== "CallExpression") return false
  const call = node as ESTree.CallExpression
  return (
    Option.isSome(AST.matchCallOf(call, "Effect", "fail")) ||
    Option.isSome(AST.matchCallOf(call, "Effect", "failCause"))
  )
}

/**
 * Check if a function body is a single `Effect.fail(...)` expression.
 * Handles: `(e) => Effect.fail(f(e))` and `(e) => { return Effect.fail(f(e)) }`
 */
const bodyIsEffectFail = (fn: ESTree.Node): boolean => {
  const body = (fn as unknown as Record<string, unknown>)["body"]
  if (body == null || typeof body !== "object") return false
  const bodyNode = body as ESTree.Node
  // Arrow with expression body: (e) => Effect.fail(f(e))
  if (bodyNode.type !== "BlockStatement") {
    return isEffectFailCall(bodyNode)
  }
  // Block body with single return: (e) => { return Effect.fail(f(e)) }
  const stmts = (bodyNode as unknown as Record<string, unknown>)["body"]
  if (!Array.isArray(stmts) || stmts.length !== 1) return false
  const stmt = stmts[0] as ESTree.Node
  if (stmt.type !== "ReturnStatement") return false
  const arg = (stmt as unknown as Record<string, unknown>)["argument"]
  return arg != null && typeof arg === "object" && isEffectFailCall(arg as ESTree.Node)
}

export const noCatchAllToMapError = Rule.define({
  name: "no-catch-all-to-map-error",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Use Effect.mapError instead of Effect.catchAll(e => Effect.fail(f(e))).",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        const call = node as ESTree.CallExpression
        const names = Option.getOrUndefined(AST.memberNames(call.callee as ESTree.MemberExpression))
        if (names === undefined) return Effect.void
        const [obj, prop] = names
        if (obj !== "Effect" && obj !== "_") return Effect.void
        if (!catchNames.has(prop)) return Effect.void

        // The callback is the last argument
        const args = call.arguments
        if (args.length === 0) return Effect.void
        const callback = args[args.length - 1]
        if (callback === undefined) return Effect.void
        if (
          callback.type !== "ArrowFunctionExpression" &&
          callback.type !== "FunctionExpression"
        ) {
          return Effect.void
        }

        if (bodyIsEffectFail(callback as ESTree.Node)) {
          const replacement = prop === "catchAllCause" ? "mapErrorCause" : "mapError"
          return ctx.report(
            Diagnostic.make({
              node,
              message: `Use Effect.${replacement} instead of Effect.${prop}(e => Effect.fail(...)).`,
            }),
          )
        }
        return Effect.void
      },
    }
  },
})

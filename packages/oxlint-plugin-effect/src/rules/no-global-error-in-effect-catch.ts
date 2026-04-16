/**
 * Ban `new Error()` inside Effect catch handlers.
 *
 * Catches: `.catchAll(e => new Error(...))`, `.catch(e => new Error(...))`
 * Use Schema.TaggedErrorClass or Data.TaggedError instead.
 *
 * Source: language-service/globalErrorInEffectCatch
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

const catchMethods = new Set([
  "catch",
  "catchAll",
  "catchAllCause",
  "catchIf",
  "catchCauseIf",
  "catchTag",
  "catchTags",
  "catchDefect",
])

const isNativeErrorNew = (node: ESTree.Node): boolean => {
  if (node.type !== "NewExpression") return false
  const callee = (node as unknown as Record<string, unknown>)["callee"] as ESTree.Node
  return callee.type === "Identifier" && "name" in callee && nativeErrors.has(callee.name as string)
}

/**
 * Check if a function body returns `new Error(...)`.
 */
const bodyReturnsNativeError = (fn: ESTree.Node): boolean => {
  const body = (fn as unknown as Record<string, unknown>)["body"] as ESTree.Node
  // Arrow expression body: (e) => new Error(...)
  if (body.type !== "BlockStatement") {
    return isNativeErrorNew(body)
  }
  // Block body: (e) => { return new Error(...) }
  const stmts = (body as unknown as Record<string, unknown>)["body"]
  if (!Array.isArray(stmts) || stmts.length !== 1) return false
  const stmt = stmts[0] as ESTree.Node
  if (stmt.type !== "ReturnStatement") return false
  const arg = (stmt as unknown as Record<string, unknown>)["argument"]
  return arg != null && typeof arg === "object" && isNativeErrorNew(arg as ESTree.Node)
}

export const noGlobalErrorInEffectCatch = Rule.define({
  name: "no-global-error-in-effect-catch",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid native Error in Effect catch handlers. Use Schema.TaggedErrorClass or Data.TaggedError.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        const call = node as ESTree.CallExpression
        const names = Option.getOrUndefined(
          AST.memberNames(call.callee as ESTree.MemberExpression),
        )
        if (names === undefined) return Effect.void
        const [obj, prop] = names
        if (obj !== "Effect") return Effect.void
        if (!catchMethods.has(prop)) return Effect.void

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

        if (bodyReturnsNativeError(callback as ESTree.Node)) {
          return ctx.report(
            Diagnostic.make({
              node: callback,
              message:
                "Avoid native Error in Effect catch handler. Use Schema.TaggedErrorClass or Data.TaggedError.",
            }),
          )
        }
        return Effect.void
      },
    }
  },
})

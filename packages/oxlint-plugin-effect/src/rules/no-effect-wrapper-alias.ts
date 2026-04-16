/**
 * Ban wrapper functions that just alias an Effect.fn or pipe(Effect.fn(...)).
 *
 * Inline the pipeline at the call site or define a real domain function.
 *
 * Source: biome-effect-linting-rules/no-effect-wrapper-alias
 */
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

const isEffectFnCall = (node: unknown): boolean => {
  if (node == null || typeof node !== "object") return false
  const n = node as Record<string, unknown>
  if (n["type"] !== "CallExpression") return false
  const callee = n["callee"]
  if (callee == null || typeof callee !== "object") return false
  const c = callee as Record<string, unknown>
  if (c["type"] !== "MemberExpression") return false
  const obj = c["object"] as Record<string, unknown> | null
  const prop = c["property"] as Record<string, unknown> | null
  return (
    obj != null && obj["type"] === "Identifier" && obj["name"] === "Effect" &&
    prop != null && prop["type"] === "Identifier" && prop["name"] === "fn"
  )
}

const isPipeWrappingEffectFn = (node: unknown): boolean => {
  if (node == null || typeof node !== "object") return false
  const n = node as Record<string, unknown>
  if (n["type"] !== "CallExpression") return false
  const callee = n["callee"]
  if (callee == null || typeof callee !== "object") return false
  const c = callee as Record<string, unknown>
  if (!(c["type"] === "Identifier" && c["name"] === "pipe")) return false
  const args = n["arguments"]
  if (!Array.isArray(args) || args.length === 0) return false
  return isEffectFnCall(args[0])
}

export const noEffectWrapperAlias = Rule.define({
  name: "no-effect-wrapper-alias",
  meta: Rule.meta({
    type: "suggestion",
    description: "Avoid wrapper functions aliasing Effect.fn. Inline or define a real domain function.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      VariableDeclarator: (node) => {
        if (!("init" in node) || node.init == null) return Effect.void
        const init = node.init

        // const x = Effect.fn(...)
        if (isEffectFnCall(init)) {
          return ctx.report(
            Diagnostic.make({
              node,
              message: "Avoid aliasing Effect.fn. Inline the pipeline or define a real domain function.",
            }),
          )
        }

        // const x = pipe(Effect.fn(...), ...)
        if (isPipeWrappingEffectFn(init)) {
          return ctx.report(
            Diagnostic.make({
              node,
              message: "Avoid wrapping Effect.fn in pipe. Inline the pipeline or define a real domain function.",
            }),
          )
        }

        // const x = () => Effect.fn(...)  or  const x = () => pipe(Effect.fn(...))
        if (
          typeof init === "object" &&
          "type" in init &&
          (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") &&
          "body" in init
        ) {
          const body = init.body
          if (isEffectFnCall(body) || isPipeWrappingEffectFn(body)) {
            return ctx.report(
              Diagnostic.make({
                node,
                message: "Avoid wrapper function aliasing Effect.fn. Inline or define a real domain function.",
              }),
            )
          }
        }

        return Effect.void
      },
    }
  },
})

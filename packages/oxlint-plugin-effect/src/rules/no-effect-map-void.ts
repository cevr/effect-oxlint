/**
 * Ban `Effect.map(() => undefined)` / `Effect.map(() => void 0)` / `Effect.map(() => {})`.
 *
 * Use `Effect.asVoid` instead.
 *
 * Source: language-service/effectMapVoid
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

const isVoidCallback = (arg: unknown): boolean => {
  if (arg == null || typeof arg !== "object" || !("type" in arg)) return false

  // Arrow function: () => undefined, () => void 0, () => {}
  if (arg.type === "ArrowFunctionExpression" && "body" in arg) {
    const body = arg.body
    if (body == null || typeof body !== "object" || !("type" in body)) return false

    // () => undefined
    if (body.type === "Identifier" && "name" in body && body.name === "undefined") return true

    // () => void 0
    if (
      body.type === "UnaryExpression" &&
      "operator" in body &&
      body.operator === "void"
    )
      return true

    // () => {}  (empty block)
    if (
      body.type === "BlockStatement" &&
      "body" in body &&
      Array.isArray(body.body) &&
      body.body.length === 0
    )
      return true
  }

  return false
}

export const noEffectMapVoid = Rule.define({
  name: "no-effect-map-void",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid Effect.map(() => undefined). Use Effect.asVoid instead.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        if (!AST.isCallOf(node as ESTree.CallExpression, "Effect", "map")) return Effect.void

        if (
          "arguments" in node &&
          Array.isArray(node.arguments) &&
          node.arguments.length >= 1
        ) {
          // Effect.map(effect, fn) or as pipe arg Effect.map(fn)
          const fn =
            node.arguments.length === 2
              ? node.arguments[1]
              : node.arguments[0]
          if (isVoidCallback(fn)) {
            return ctx.report(
              Diagnostic.make({
                node,
                message: "Use Effect.asVoid instead of Effect.map(() => undefined).",
              }),
            )
          }
        }
        return Effect.void
      },
    }
  },
})

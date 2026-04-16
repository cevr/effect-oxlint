/**
 * Ban `Option.match(x, { onSome: (v) => v === true, onNone: () => false })`.
 *
 * Normalize at the schema boundary instead.
 *
 * Source: biome-effect-linting-rules/no-option-boolean-normalization
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

export const noOptionBooleanNormalization = Rule.define({
  name: "no-option-boolean-normalization",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid Option.match for boolean normalization. Normalize at schema boundary.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        if (!AST.isCallOf(node as ESTree.CallExpression, "Option", "match")) return Effect.void

        if (!("arguments" in node) || !Array.isArray(node.arguments) || node.arguments.length < 2)
          return Effect.void

        const opts = node.arguments[1]
        if (opts == null || typeof opts !== "object" || !("type" in opts)) return Effect.void
        if (opts.type !== "ObjectExpression" || !("properties" in opts) || !Array.isArray(opts.properties))
          return Effect.void

        let hasTripleEqualTrue = false
        let hasReturnFalse = false

        for (const prop of opts.properties) {
          if (prop == null || typeof prop !== "object" || !("type" in prop) || prop.type !== "Property")
            continue
          const key = (prop as unknown as Record<string, unknown>)["key"] as unknown as Record<string, unknown> | null
          const value = (prop as unknown as Record<string, unknown>)["value"] as unknown as Record<string, unknown> | null

          if (key == null || value == null) continue

          // onSome: (v) => v === true
          if (
            key["type"] === "Identifier" && key["name"] === "onSome" &&
            value["type"] === "ArrowFunctionExpression" && "body" in value
          ) {
            const body = value["body"] as unknown as Record<string, unknown> | null
            if (
              body != null &&
              body["type"] === "BinaryExpression" &&
              body["operator"] === "===" &&
              "right" in body
            ) {
              const right = body["right"] as unknown as Record<string, unknown> | null
              if (right != null && right["type"] === "Literal" && right["value"] === true) {
                hasTripleEqualTrue = true
              }
            }
          }

          // onNone: () => false
          if (
            key["type"] === "Identifier" && key["name"] === "onNone" &&
            value["type"] === "ArrowFunctionExpression" && "body" in value
          ) {
            const body = value["body"] as unknown as Record<string, unknown> | null
            if (body != null && body["type"] === "Literal" && body["value"] === false) {
              hasReturnFalse = true
            }
          }
        }

        if (hasTripleEqualTrue && hasReturnFalse) {
          return ctx.report(
            Diagnostic.make({
              node,
              message:
                "Avoid Option.match for boolean normalization. Normalize at schema boundary instead.",
            }),
          )
        }
        return Effect.void
      },
    }
  },
})

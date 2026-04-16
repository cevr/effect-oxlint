/**
 * Ban `Option.fromNullable(x ?? null)` / `Option.fromNullable(x ?? undefined)`.
 *
 * The nullish coalescing is redundant — pass the source directly.
 *
 * Source: biome-effect-linting-rules/no-fromnullable-nullish-coalesce
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

export const noFromNullableCoalesce = Rule.define({
  name: "no-fromnullable-coalesce",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Redundant nullish coalescing in Option.fromNullable. Pass the value directly.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        // Match Option.fromNullable(...) or Option.fromNullishOr(...)
        const ce = node as ESTree.CallExpression
        const isFromNullable =
          AST.isCallOf(ce, "Option", "fromNullable") ||
          AST.isCallOf(ce, "Option", "fromNullishOr")
        if (!isFromNullable) return Effect.void

        if ("arguments" in node && Array.isArray(node.arguments) && node.arguments.length >= 1) {
          const arg = node.arguments[0]
          if (
            arg != null &&
            typeof arg === "object" &&
            "type" in arg &&
            arg.type === "LogicalExpression" &&
            "operator" in arg &&
            arg.operator === "??"
          ) {
            // Check RHS is null or undefined
            if ("right" in arg && arg.right != null && typeof arg.right === "object" && "type" in arg.right) {
              const rhs = arg.right
              const isNullish =
                (rhs.type === "Literal" && "value" in rhs && rhs.value === null) ||
                (rhs.type === "Identifier" && "name" in rhs && rhs.name === "undefined")
              if (isNullish) {
                return ctx.report(
                  Diagnostic.make({
                    node,
                    message:
                      "Redundant ?? null/undefined in Option.fromNullable. Pass the value directly.",
                  }),
                )
              }
            }
          }
        }
        return Effect.void
      },
    }
  },
})

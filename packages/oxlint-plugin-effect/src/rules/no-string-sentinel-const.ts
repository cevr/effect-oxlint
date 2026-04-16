/**
 * Ban `const x = "some-string"` string literal const declarations.
 *
 * Use tagged unions, Option, or meaningful domain values.
 *
 * Source: biome-effect-linting-rules/no-string-sentinel-const
 *
 * Note: Very aggressive — should probably be off by default or in a strict preset only.
 */
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

export const noStringSentinelConst = Rule.define({
  name: "no-string-sentinel-const",
  meta: Rule.meta({
    type: "suggestion",
    description: "Avoid string literal const declarations. Use tagged unions or domain values.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      VariableDeclarator: (node) => {
        if (!("init" in node) || node.init == null) return Effect.void
        const init = node.init as unknown as Record<string, unknown>

        if (init["type"] === "Literal" && typeof init["value"] === "string") {
          // Check parent is const declaration
          if (
            "parent" in node &&
            node.parent != null &&
            typeof node.parent === "object" &&
            "type" in node.parent &&
            node.parent.type === "VariableDeclaration" &&
            "kind" in node.parent &&
            node.parent.kind === "const"
          ) {
            return ctx.report(
              Diagnostic.make({
                node,
                message: "Avoid string literal const. Use tagged unions, Option, or domain values.",
              }),
            )
          }
        }
        return Effect.void
      },
    }
  },
})

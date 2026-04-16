/**
 * Ban `() => { return x }` — use `() => x` instead.
 *
 * Source: language-service/unnecessaryArrowBlock
 */
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

export const noUnnecessaryArrowBlock = Rule.define({
  name: "no-unnecessary-arrow-block",
  meta: Rule.meta({
    type: "suggestion",
    description: "Unnecessary arrow block body. Use concise arrow `() => expr`.",
    fixable: "code",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      ArrowFunctionExpression: (node) => {
        if (
          "body" in node &&
          node.body != null &&
          typeof node.body === "object" &&
          "type" in node.body &&
          node.body.type === "BlockStatement" &&
          "body" in node.body &&
          Array.isArray(node.body.body) &&
          node.body.body.length === 1
        ) {
          const stmt = node.body.body[0]
          if (
            stmt != null &&
            typeof stmt === "object" &&
            "type" in stmt &&
            stmt.type === "ReturnStatement" &&
            "argument" in stmt &&
            stmt.argument != null
          ) {
            return ctx.report(
              Diagnostic.make({
                node,
                message: "Unnecessary arrow block body. Use `() => expr` instead of `() => { return expr }`.",
              }),
            )
          }
        }
        return Effect.void
      },
    }
  },
})

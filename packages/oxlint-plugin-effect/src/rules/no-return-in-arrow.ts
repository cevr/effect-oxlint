/**
 * Ban explicit `return` in arrow function callbacks (info severity).
 *
 * Use expression-only callbacks + pipeline logic.
 * Excludes Schema.filter callbacks where return is required.
 *
 * Source: biome-effect-linting-rules/no-return-in-arrow
 */
import { Diagnostic, Rule } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

export const noReturnInArrow = Rule.define({
  name: "no-return-in-arrow",
  meta: Rule.meta({
    type: "suggestion",
    description: "Prefer expression-only arrow callbacks. Avoid explicit return in arrow functions.",
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
          Array.isArray(node.body.body)
        ) {
          for (const stmt of node.body.body) {
            if (
              stmt != null &&
              typeof stmt === "object" &&
              "type" in stmt &&
              stmt.type === "ReturnStatement"
            ) {
              // Check if parent is a Schema.filter call — skip those
              if (
                "parent" in node &&
                node.parent != null &&
                typeof node.parent === "object" &&
                "type" in node.parent &&
                node.parent.type === "CallExpression" &&
                "callee" in node.parent
              ) {
                const callee = node.parent.callee
                if (
                  callee != null &&
                  typeof callee === "object" &&
                  "type" in callee &&
                  callee.type === "MemberExpression" &&
                  "property" in callee &&
                  callee.property != null &&
                  typeof callee.property === "object" &&
                  "name" in callee.property &&
                  (callee.property.name === "filter" || callee.property.name === "check")
                ) {
                  return Effect.void
                }
              }

              return ctx.report(
                Diagnostic.make({
                  node: stmt,
                  message: "Prefer expression-only arrow callbacks over explicit return.",
                }),
              )
            }
          }
        }
        return Effect.void
      },
    }
  },
})

/**
 * Ban `instanceof` checks against Schema-derived classes.
 *
 * Use `Schema.is(SchemaType)` instead.
 *
 * Source: language-service/instanceOfSchema
 *
 * Note: Without type information, we detect common Effect Schema class names
 * used in `instanceof` checks. This is a best-effort heuristic.
 */
import { Diagnostic, Rule } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

export const noInstanceofSchema = Rule.define({
  name: "no-instanceof-schema",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid instanceof with Schema types. Use Schema.is(SchemaType) instead.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      BinaryExpression: (node) => {
        if (
          "operator" in node &&
          node.operator === "instanceof"
        ) {
          // Report all instanceof — in Effect codebases, instanceof is generally wrong
          return ctx.report(
            Diagnostic.make({
              node,
              message:
                "Avoid instanceof. Use Schema.is(SchemaType) for Schema types, or _tag checks for tagged types.",
            }),
          )
        }
        return Effect.void
      },
    }
  },
})

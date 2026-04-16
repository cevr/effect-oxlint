/**
 * Ban ternary expressions in Effect codebases.
 *
 * Use `Option.match`, `Either.match`, `Match.value` instead.
 *
 * Source: biome-effect-linting-rules/no-ternary
 *
 * Note: Very opinionated — recommended for strict functional presets only.
 */
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"

export const noTernary = Rule.define({
  name: "no-ternary",
  meta: Rule.meta({
    type: "suggestion",
    description: "Avoid ternary expressions. Use Option.match, Either.match, or Match.value.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      ConditionalExpression: (node) =>
        ctx.report(
          Diagnostic.make({
            node,
            message: "Avoid ternary expressions. Use Option.match, Either.match, or Match.value.",
          }),
        ),
    }
  },
})

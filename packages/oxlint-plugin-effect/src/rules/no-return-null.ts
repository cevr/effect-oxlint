/**
 * Ban `return null` statements.
 *
 * Use Option.none for absence or Effect.fail for errors.
 *
 * Source: biome-effect-linting-rules/no-return-null
 */
import { AST, Diagnostic, Rule, Visitor } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { pipe } from "effect/Function"

export const noReturnNull = Rule.define({
  name: "no-return-null",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid returning null. Use Option.none for absence or Effect.fail for errors.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      ReturnStatement: (node) => {
        if (
          node.type === "ReturnStatement" &&
          "argument" in node &&
          node.argument !== null &&
          node.argument !== undefined &&
          "type" in node.argument &&
          node.argument.type === "Literal" &&
          "value" in node.argument &&
          node.argument.value === null
        ) {
          return ctx.report(
            Diagnostic.make({
              node,
              message:
                "Avoid returning null. Use Option.none for absence.",
            }),
          )
        }
        return Effect.void
      },
    }
  },
})

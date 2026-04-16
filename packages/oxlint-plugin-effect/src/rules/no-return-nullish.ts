/**
 * Ban `return null` and `return undefined` statements.
 *
 * Use Option.none() for absence, Effect.void for void effects,
 * or Option.fromNullable at system boundaries.
 *
 * Source: biome-effect-linting-rules/no-return-null (extended)
 */
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

export const noReturnNullish = Rule.define({
  name: "no-return-nullish",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid returning null/undefined. Use Option.none() for absence or Effect.void for void effects.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      ReturnStatement: (node) => {
        if (
          node.type !== "ReturnStatement" ||
          !("argument" in node) ||
          node.argument === null ||
          node.argument === undefined
        ) {
          return Effect.void
        }

        const arg = node.argument as unknown as Record<string, unknown>

        // return null
        if (arg["type"] === "Literal" && arg["value"] === null) {
          return ctx.report(
            Diagnostic.make({
              node,
              message:
                "Avoid returning null. Use Option.none() for absence, or Option.fromNullable() at system boundaries.",
            }),
          )
        }

        // return undefined
        if (arg["type"] === "Identifier" && arg["name"] === "undefined") {
          return ctx.report(
            Diagnostic.make({
              node,
              message:
                "Avoid returning undefined. Use Option.none() for absence, or Effect.void for void effects.",
            }),
          )
        }

        // return void 0
        if (arg["type"] === "UnaryExpression" && arg["operator"] === "void") {
          return ctx.report(
            Diagnostic.make({
              node,
              message:
                "Avoid returning void expression. Use Option.none() for absence, or Effect.void for void effects.",
            }),
          )
        }

        return Effect.void
      },
    }
  },
})

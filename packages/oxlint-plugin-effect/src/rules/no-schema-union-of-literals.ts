/**
 * Ban `Schema.Union(Schema.Literal("a"), Schema.Literal("b"))`.
 * Use `Schema.Literal("a", "b")` instead.
 *
 * Source: language-service/schemaUnionOfLiterals
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

const isSchemaLiteral = (node: ESTree.Node): boolean => {
  if (node.type !== "CallExpression") return false
  return Option.isSome(AST.matchCallOf(node as ESTree.CallExpression, "Schema", "Literal"))
}

export const noSchemaUnionOfLiterals = Rule.define({
  name: "no-schema-union-of-literals",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Use Schema.Literal('a', 'b') instead of Schema.Union(Schema.Literal('a'), Schema.Literal('b')).",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        const call = node as ESTree.CallExpression
        if (Option.isNone(AST.matchCallOf(call, "Schema", "Union"))) return Effect.void

        const args = call.arguments
        if (args.length < 2) return Effect.void

        // Check if all arguments are Schema.Literal calls
        const allLiterals = args.every((arg) => isSchemaLiteral(arg as ESTree.Node))
        if (!allLiterals) return Effect.void

        return ctx.report(
          Diagnostic.make({
            node,
            message:
              "Use Schema.Literal('a', 'b') instead of Schema.Union(Schema.Literal('a'), Schema.Literal('b')).",
          }),
        )
      },
    }
  },
})

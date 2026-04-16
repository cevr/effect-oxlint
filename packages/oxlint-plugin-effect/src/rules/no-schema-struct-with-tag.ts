/**
 * Ban `Schema.Struct({ _tag: Schema.Literal("Foo"), ... })`.
 * Use `Schema.TaggedStruct("Foo", { ... })` instead.
 *
 * Source: language-service/schemaStructWithTag
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

const isTagKey = (key: ESTree.Node): boolean => {
  if (key.type === "Identifier" && "name" in key && key.name === "_tag") return true
  if (key.type === "Literal" && "value" in key && key.value === "_tag") return true
  return false
}

export const noSchemaStructWithTag = Rule.define({
  name: "no-schema-struct-with-tag",
  meta: Rule.meta({
    type: "suggestion",
    description:
      'Use Schema.TaggedStruct("Tag", { ... }) instead of Schema.Struct({ _tag: Schema.Literal("Tag"), ... }).',
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        const call = node as ESTree.CallExpression
        if (Option.isNone(AST.matchCallOf(call, "Schema", "Struct"))) return Effect.void

        const args = call.arguments
        if (args.length !== 1) return Effect.void
        const arg = args[0]
        if (arg === undefined) return Effect.void
        if (arg.type !== "ObjectExpression") return Effect.void

        const props = (arg as unknown as Record<string, unknown>)["properties"]
        if (!Array.isArray(props)) return Effect.void

        for (const prop of props) {
          const p = prop as ESTree.Node
          if (p.type !== "Property") continue
          const key = (p as unknown as Record<string, unknown>)["key"] as ESTree.Node
          if (!isTagKey(key)) continue

          // Check value is Schema.Literal(...)
          const value = (p as unknown as Record<string, unknown>)["value"] as ESTree.Node
          if (value.type === "CallExpression" && Option.isSome(AST.matchCallOf(value as ESTree.CallExpression, "Schema", "Literal"))) {
            return ctx.report(
              Diagnostic.make({
                node,
                message:
                  'Use Schema.TaggedStruct("Tag", { ... }) instead of Schema.Struct({ _tag: Schema.Literal(...), ... }).',
              }),
            )
          }
        }

        return Effect.void
      },
    }
  },
})

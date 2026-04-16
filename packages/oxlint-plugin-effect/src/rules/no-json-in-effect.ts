/**
 * Ban `JSON.parse`/`JSON.stringify` inside Effect.gen/fn context.
 *
 * Use Schema.fromJsonString for type-safe JSON.
 *
 * Source: language-service/preferSchemaOverJson (inside Effect context)
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, Visitor, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"

import { makeEffectContextTracker } from "./_effect-context.js"

export const noJsonInEffect = Rule.define({
  name: "no-json-in-effect",
  meta: Rule.meta({
    type: "suggestion",
    description: "Avoid JSON.parse/stringify inside Effect.gen/fn. Use Schema.fromJsonString.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const [depth, tracker] = yield* makeEffectContextTracker

    return Visitor.merge(tracker, {
      MemberExpression: (node) =>
        Effect.flatMap(Ref.get(depth), (d) => {
          if (
            d > 0 &&
            Option.isSome(AST.matchMember(node as ESTree.MemberExpression, "JSON", ["parse", "stringify"]))
          ) {
            return ctx.report(
              Diagnostic.make({
                node,
                message: "Avoid JSON.parse/stringify inside Effect context. Use Schema.fromJsonString.",
              }),
            )
          }
          return Effect.void
        }),
    })
  },
})

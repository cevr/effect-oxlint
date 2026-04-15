/**
 * Ban `Date.now()` and `new Date()` inside Effect.gen/fn context.
 *
 * Use Clock service instead.
 *
 * Source: language-service/globalDateInEffect
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, Visitor } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"

import { makeEffectContextTracker } from "./_effect-context.js"

export const noDateInEffect = Rule.define({
  name: "no-date-in-effect",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid Date.now() and new Date() inside Effect.gen/fn. Use Clock service.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const [depth, tracker] = yield* makeEffectContextTracker

    return Visitor.merge(
      tracker,
      {
        MemberExpression: (node) =>
          Effect.flatMap(Ref.get(depth), (d) => {
            if (d > 0 && Option.isSome(AST.matchMember(node as ESTree.MemberExpression, "Date", "now"))) {
              return ctx.report(
                Diagnostic.make({ node, message: "Avoid Date.now() inside Effect context. Use Clock service." }),
              )
            }
            return Effect.void
          }),
        NewExpression: (node) =>
          Effect.flatMap(Ref.get(depth), (d) => {
            if (
              d > 0 &&
              "callee" in node &&
              node.callee != null &&
              typeof node.callee === "object" &&
              "type" in node.callee &&
              node.callee.type === "Identifier" &&
              "name" in node.callee &&
              node.callee.name === "Date"
            ) {
              return ctx.report(
                Diagnostic.make({ node, message: "Avoid new Date() inside Effect context. Use Clock service." }),
              )
            }
            return Effect.void
          }),
      },
    )
  },
})

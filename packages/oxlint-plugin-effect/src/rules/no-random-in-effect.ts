/**
 * Ban `Math.random()` inside Effect.gen/fn context.
 *
 * Use Random service instead.
 *
 * Source: language-service/globalRandomInEffect
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, Visitor } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"

import { makeEffectContextTracker } from "./_effect-context.js"

export const noRandomInEffect = Rule.define({
  name: "no-random-in-effect",
  meta: Rule.meta({
    type: "suggestion",
    description: "Avoid Math.random() inside Effect.gen/fn. Use Random service.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const [depth, tracker] = yield* makeEffectContextTracker

    return Visitor.merge(tracker, {
      MemberExpression: (node) =>
        Effect.flatMap(Ref.get(depth), (d) => {
          if (d > 0 && Option.isSome(AST.matchMember(node as ESTree.MemberExpression, "Math", "random"))) {
            return ctx.report(
              Diagnostic.make({ node, message: "Avoid Math.random() inside Effect context. Use Random service." }),
            )
          }
          return Effect.void
        }),
    })
  },
})

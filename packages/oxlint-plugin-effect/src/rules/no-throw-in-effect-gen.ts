/**
 * Ban `throw` statements inside Effect.gen/fn generators.
 *
 * Use Effect.fail with tagged errors instead.
 *
 * Source: effect convention — errors should be in the type system
 */
import { Diagnostic, Rule, Visitor } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"

import { makeEffectContextTracker } from "./_effect-context.js"

export const noThrowInEffectGen = Rule.define({
  name: "no-throw-in-effect-gen",
  meta: Rule.meta({
    type: "problem",
    description:
      "Avoid throw inside Effect.gen/fn. Use Effect.fail with tagged errors.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const [depth, tracker] = yield* makeEffectContextTracker

    return Visitor.merge(tracker, {
      ThrowStatement: (node) =>
        Effect.flatMap(Ref.get(depth), (d) => {
          if (d > 0) {
            return ctx.report(
              Diagnostic.make({
                node,
                message:
                  "Avoid throw inside Effect.gen/fn. Use Effect.fail with tagged errors.",
              }),
            )
          }
          return Effect.void
        }),
    })
  },
})

/**
 * Ban `throw` statements. Context-aware messaging.
 *
 * Inside Effect.gen/fn: "Use yield* Effect.fail() or yield* new MyError()"
 * Outside: "Model errors with Effect.fail() — wrap this function with Effect.fn"
 *
 * Source: effect convention — errors should be in the type system
 */
import { Diagnostic, Rule, Visitor, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"

import { makeEffectContextTracker } from "./_effect-context.js"

export const noThrowStatement = Rule.define({
  name: "no-throw-statement",
  meta: Rule.meta({
    type: "problem",
    description: "Avoid throw. Use Effect.fail with tagged errors.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const [depth, tracker] = yield* makeEffectContextTracker

    return Visitor.merge(tracker, {
      ThrowStatement: (node) =>
        Effect.flatMap(Ref.get(depth), (d) =>
          ctx.report(
            Diagnostic.make({
              node,
              message: d > 0
                ? "Avoid throw inside Effect.gen/fn. Use yield* Effect.fail(new MyError()) or yield* new MyError() for yieldable errors."
                : "Avoid throw. Model errors with Effect — wrap this function with Effect.fn and use Effect.fail with tagged errors.",
            }),
          ),
        ),
    })
  },
})

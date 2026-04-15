/**
 * Ban `try/catch` inside Effect.gen/fn generators.
 *
 * Use Effect.try, Effect.tryPromise, or Effect.catch* instead.
 *
 * Source: language-service/tryCatchInEffectGen
 */
import { Diagnostic, Rule, Visitor } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"

import { makeEffectContextTracker } from "./_effect-context.js"

export const noTryCatchInEffectGen = Rule.define({
  name: "no-try-catch-in-effect-gen",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid try/catch inside Effect.gen/fn. Use Effect.try or Effect.tryPromise.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const [depth, tracker] = yield* makeEffectContextTracker

    return Visitor.merge(tracker, {
      TryStatement: (node) =>
        Effect.flatMap(Ref.get(depth), (d) => {
          if (d > 0) {
            return ctx.report(
              Diagnostic.make({
                node,
                message:
                  "Avoid try/catch inside Effect.gen/fn. Use Effect.try, Effect.tryPromise, or Effect.catch*.",
              }),
            )
          }
          return Effect.void
        }),
    })
  },
})

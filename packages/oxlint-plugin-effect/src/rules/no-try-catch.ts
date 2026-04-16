/**
 * Ban `try/catch` statements. Context-aware messaging.
 *
 * Inside Effect.gen/fn: "Use Effect.try or Effect.tryPromise"
 * Outside: "Wrap with Effect.fn and use Effect.try for error handling"
 *
 * Source: biome-effect-linting-rules/no-try-catch, language-service/tryCatchInEffectGen
 */
import { Diagnostic, Rule, Visitor, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"

import { makeEffectContextTracker } from "./_effect-context.js"

export const noTryCatch = Rule.define({
  name: "no-try-catch",
  meta: Rule.meta({
    type: "suggestion",
    description: "Avoid try/catch. Use Effect.try or Effect.tryPromise.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const [depth, tracker] = yield* makeEffectContextTracker

    return Visitor.merge(tracker, {
      TryStatement: (node) =>
        Effect.flatMap(Ref.get(depth), (d) =>
          ctx.report(
            Diagnostic.make({
              node,
              message: d > 0
                ? "Avoid try/catch inside Effect.gen/fn. Use Effect.try({ try: () => ..., catch: (e) => new MyError({ cause: e }) })."
                : "Avoid try/catch. Wrap this function with Effect.fn and use Effect.try or Effect.tryPromise for error handling.",
            }),
          ),
        ),
    })
  },
})

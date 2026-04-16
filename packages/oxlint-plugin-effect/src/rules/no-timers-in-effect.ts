/**
 * Ban `setTimeout`/`setInterval` inside Effect.gen/fn context.
 *
 * Use Effect.sleep or Schedule instead.
 *
 * Source: language-service/globalTimersInEffect
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, Visitor, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"

import { makeEffectContextTracker } from "./_effect-context.js"

const timerNames = ["setTimeout", "setInterval"]

export const noTimersInEffect = Rule.define({
  name: "no-timers-in-effect",
  meta: Rule.meta({
    type: "suggestion",
    description: "Avoid setTimeout/setInterval inside Effect.gen/fn. Use Effect.sleep or Schedule.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const [depth, tracker] = yield* makeEffectContextTracker

    return Visitor.merge(tracker, {
      CallExpression: (node) =>
        Effect.flatMap(Ref.get(depth), (d) => {
          if (d > 0) {
            const name = Option.getOrUndefined(AST.calleeName(node as ESTree.CallExpression))
            if (name !== undefined && timerNames.includes(name)) {
              return ctx.report(
                Diagnostic.make({
                  node,
                  message: "Avoid setTimeout/setInterval inside Effect context. Use Effect.sleep or Schedule.",
                }),
              )
            }
          }
          return Effect.void
        }),
    })
  },
})

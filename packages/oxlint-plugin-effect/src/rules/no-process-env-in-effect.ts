/**
 * Ban `process.env` inside Effect.gen/fn context.
 *
 * Use Effect Config service instead.
 *
 * Source: language-service/processEnvInEffect
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, Visitor, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"

import { makeEffectContextTracker } from "./_effect-context.js"

export const noProcessEnvInEffect = Rule.define({
  name: "no-process-env-in-effect",
  meta: Rule.meta({
    type: "suggestion",
    description: "Avoid process.env inside Effect.gen/fn. Use Config service.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const [depth, tracker] = yield* makeEffectContextTracker

    return Visitor.merge(tracker, {
      MemberExpression: (node) =>
        Effect.flatMap(Ref.get(depth), (d) => {
          if (d > 0 && Option.isSome(AST.matchMember(node as ESTree.MemberExpression, "process", "env"))) {
            return ctx.report(
              Diagnostic.make({ node, message: "Avoid process.env inside Effect context. Use Config service." }),
            )
          }
          return Effect.void
        }),
    })
  },
})

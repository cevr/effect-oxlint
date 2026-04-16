/**
 * Ban `fetch()` inside Effect.gen/fn context.
 *
 * Use HttpClient from 'effect/unstable/http' instead.
 *
 * Source: language-service/globalFetchInEffect
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, Visitor, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"

import { makeEffectContextTracker } from "./_effect-context.js"

export const noFetchInEffect = Rule.define({
  name: "no-fetch-in-effect",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid fetch() inside Effect.gen/fn. Use HttpClient from 'effect/unstable/http'.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const [depth, tracker] = yield* makeEffectContextTracker

    return Visitor.merge(tracker, {
      CallExpression: (node) =>
        Effect.flatMap(Ref.get(depth), (d) => {
          if (d > 0) {
            const name = Option.getOrUndefined(AST.calleeName(node as ESTree.CallExpression))
            if (name === "fetch") {
              return ctx.report(
                Diagnostic.make({
                  node,
                  message:
                    "Avoid fetch() inside Effect context. Use HttpClient from 'effect/unstable/http'.",
                }),
              )
            }
          }
          return Effect.void
        }),
    })
  },
})

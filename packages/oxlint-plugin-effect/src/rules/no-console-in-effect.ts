/**
 * Ban `console.*` calls inside Effect.gen/fn context.
 *
 * Use Effect Logger service instead.
 *
 * Source: language-service/globalConsoleInEffect
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, Visitor } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"

import { makeEffectContextTracker } from "./_effect-context.js"

const consoleMethods = ["log", "warn", "error", "info", "debug", "trace"]

export const noConsoleInEffect = Rule.define({
  name: "no-console-in-effect",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid console.* inside Effect.gen/fn. Use Effect Logger service.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const [depth, tracker] = yield* makeEffectContextTracker

    return Visitor.merge(tracker, {
      MemberExpression: (node) =>
        Effect.flatMap(Ref.get(depth), (d) => {
          if (d > 0 && Option.isSome(AST.matchMember(node as ESTree.MemberExpression, "console", consoleMethods))) {
            return ctx.report(
              Diagnostic.make({
                node,
                message:
                  "Avoid console.* inside Effect context. Use Effect Logger service.",
              }),
            )
          }
          return Effect.void
        }),
    })
  },
})

/**
 * Ban `Math.random()` and `crypto.randomUUID()` inside Effect.gen/fn context.
 *
 * Use Random service instead.
 *
 * Source: language-service/globalRandomInEffect, language-service/cryptoRandomUUIDInEffect
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, Visitor } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"

import { makeEffectContextTracker } from "./_effect-context.js"

const bannedMembers: ReadonlyArray<readonly [string, string, string]> = [
  ["Math", "random", "Avoid Math.random() inside Effect context. Use Random service from 'effect'."],
  ["crypto", "randomUUID", "Avoid crypto.randomUUID() inside Effect context. Use Random service from 'effect'."],
  ["crypto", "getRandomValues", "Avoid crypto.getRandomValues() inside Effect context. Use Random service from 'effect'."],
  ["Bun", "randomUUID", "Avoid Bun.randomUUID() inside Effect context. Create a platform-independent service with Bun and Node layers."],
  ["Bun", "randomUUIDv7", "Avoid Bun.randomUUIDv7() inside Effect context. Create a platform-independent service with Bun and Node layers."],
]

export const noRandomInEffect = Rule.define({
  name: "no-random-in-effect",
  meta: Rule.meta({
    type: "suggestion",
    description: "Avoid Math.random() / crypto.randomUUID() inside Effect.gen/fn. Use Random service.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const [depth, tracker] = yield* makeEffectContextTracker

    return Visitor.merge(tracker, {
      MemberExpression: (node) =>
        Effect.flatMap(Ref.get(depth), (d) => {
          if (d <= 0) return Effect.void
          const memberNode = node as ESTree.MemberExpression
          for (const [obj, prop, message] of bannedMembers) {
            if (Option.isSome(AST.matchMember(memberNode, obj, prop))) {
              return ctx.report(Diagnostic.make({ node, message }))
            }
          }
          return Effect.void
        }),
    })
  },
})

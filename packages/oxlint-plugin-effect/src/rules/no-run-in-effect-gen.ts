/**
 * Ban `Effect.run*` and `Runtime.run*` calls inside `Effect.gen`/`Effect.fn`.
 *
 * Running an effect inside a generator drops the ambient context — fibers,
 * services, tracing, and memoized layers. Just `yield*` the child effect;
 * for callback boundaries use `Effect.async`, for fork use `Effect.fork`.
 *
 * Explicitly allowed inside gen: `Effect.runForkWith`, `Effect.runPromiseWith`,
 * `Effect.runSyncWith` (they take services explicitly — legitimate at
 * callback boundaries) and `managedRuntime.runX` on identifier callees
 * (can't be discriminated syntactically).
 *
 * Source: language-service/runEffectInsideEffect, extended for v4.
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, Visitor, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"

import { makeEffectContextTracker } from "./_effect-context.js"

const effectRunMethods = ["runSync", "runPromise", "runFork", "runCallback"]
const runtimeRunMethods = ["runSync", "runPromise", "runFork", "runCallback"]

export const noRunInEffectGen = Rule.define({
  name: "no-run-in-effect-gen",
  meta: Rule.meta({
    type: "problem",
    description:
      "Running effects inside Effect.gen/fn drops the ambient context. Use yield* instead.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const [depth, tracker] = yield* makeEffectContextTracker

    return Visitor.merge(tracker, {
      CallExpression: (node) =>
        Effect.flatMap(Ref.get(depth), (d) => {
          if (d <= 0) return Effect.void
          const call = node as ESTree.CallExpression

          if (AST.isCallOf(call, "Effect", effectRunMethods)) {
            return ctx.report(
              Diagnostic.make({
                node,
                message:
                  "Avoid Effect.run* inside Effect.gen/fn. `yield*` the child effect, or use Effect.fork for concurrency.",
              }),
            )
          }

          if (AST.isCallOf(call, "Runtime", runtimeRunMethods)) {
            return ctx.report(
              Diagnostic.make({
                node,
                message:
                  "Avoid Runtime.run* inside Effect.gen/fn. The ambient context already has your services — `yield*` the child effect.",
              }),
            )
          }

          return Effect.void
        }),
    })
  },
})

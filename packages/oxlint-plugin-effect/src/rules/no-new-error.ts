/**
 * Ban `new Error(...)` and native error constructors. Context-aware messaging.
 *
 * Inside Effect.gen/fn: "Use yield* new MyError() (yieldable TaggedErrorClass)"
 * Outside: "Define class MyError extends Schema.TaggedErrorClass..."
 *
 * Source: language-service/globalErrorInEffectFailure, extendsNativeError
 */
import type { ESTree } from "@oxlint/plugins"
import { Diagnostic, Rule, Visitor, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"

import { makeEffectContextTracker } from "./_effect-context.js"

const nativeErrors = new Set([
  "Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError",
  "URIError", "EvalError",
])

export const noNewError = Rule.define({
  name: "no-new-error",
  meta: Rule.meta({
    type: "suggestion",
    description: "Avoid native Error constructors. Use Schema.TaggedErrorClass.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const [depth, tracker] = yield* makeEffectContextTracker

    return Visitor.merge(tracker, {
      NewExpression: (node) =>
        Effect.flatMap(Ref.get(depth), (d) => {
          const callee = (node as unknown as Record<string, unknown>)["callee"] as ESTree.Node
          if (
            callee.type === "Identifier" &&
            "name" in callee &&
            nativeErrors.has(callee.name as string)
          ) {
            return ctx.report(
              Diagnostic.make({
                node,
                message: d > 0
                  ? "Avoid native Error inside Effect.gen/fn. Define: class MyError extends Schema.TaggedErrorClass<MyError>()(\"MyError\", { ... }) {} — then yield* new MyError()."
                  : "Avoid native Error constructors. Define: class MyError extends Schema.TaggedErrorClass<MyError>()(\"MyError\", { message: Schema.String }) {}",
              }),
            )
          }
          return Effect.void
        }),
    })
  },
})

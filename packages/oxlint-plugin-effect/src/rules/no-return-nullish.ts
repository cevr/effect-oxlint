/**
 * Ban `return null`, `return undefined`, `return void 0`. Context-aware messaging.
 *
 * Inside Effect.gen/fn: "Use Option.none() or Effect.void"
 * Outside: "Use Option.none() — convert nullish at system boundaries with Option.fromNullable"
 *
 * Source: biome-effect-linting-rules/no-return-null (extended)
 */
import { Diagnostic, Rule, Visitor, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"

import { makeEffectContextTracker } from "./_effect-context.js"

export const noReturnNullish = Rule.define({
  name: "no-return-nullish",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid returning null/undefined. Use Option.none() for absence or Effect.void for void effects.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    const [depth, tracker] = yield* makeEffectContextTracker

    return Visitor.merge(tracker, {
      ReturnStatement: (node) =>
        Effect.flatMap(Ref.get(depth), (d) => {
          if (
            node.type !== "ReturnStatement" ||
            !("argument" in node) ||
            node.argument === null ||
            node.argument === undefined
          ) {
            return Effect.void
          }

          const arg = node.argument as unknown as Record<string, unknown>

          // return null
          if (arg["type"] === "Literal" && arg["value"] === null) {
            return ctx.report(
              Diagnostic.make({
                node,
                message: d > 0
                  ? "Avoid returning null inside Effect.gen/fn. Use Option.none() for absence, or yield* Effect.fail(new MyError()) for errors."
                  : "Avoid returning null. Use Option.none() for absence — convert nullish values at system boundaries with Option.fromNullable().",
              }),
            )
          }

          // return undefined
          if (arg["type"] === "Identifier" && arg["name"] === "undefined") {
            return ctx.report(
              Diagnostic.make({
                node,
                message: d > 0
                  ? "Avoid returning undefined inside Effect.gen/fn. Use Effect.void for void effects, or Option.none() for absence."
                  : "Avoid returning undefined. Use Option.none() for absence, or restructure as an Effect returning void.",
              }),
            )
          }

          // return void 0
          if (arg["type"] === "UnaryExpression" && arg["operator"] === "void") {
            return ctx.report(
              Diagnostic.make({
                node,
                message: d > 0
                  ? "Avoid returning void inside Effect.gen/fn. Use Effect.void for void effects."
                  : "Avoid returning void expression. Use Option.none() for absence.",
              }),
            )
          }

          return Effect.void
        }),
    })
  },
})

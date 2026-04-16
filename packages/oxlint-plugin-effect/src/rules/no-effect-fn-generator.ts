/**
 * Ban `Effect.fn(function* () { ... })` called with a generator argument.
 *
 * Effect.fn should wrap a plain function or arrow that builds a pipeline,
 * not a generator (use Effect.gen for generators).
 *
 * Source: biome-effect-linting-rules/no-effect-fn-generator
 *
 * Note: This rule may be too aggressive. In Effect v4, `Effect.fn("name")(function*() {...})`
 * is actually the idiomatic pattern. This rule targets `Effect.fn(function*() {...})` without
 * a name span, which is the discouraged pattern from the biome rules.
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

export const noEffectFnGenerator = Rule.define({
  name: "no-effect-fn-generator",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Effect.fn should not directly wrap a generator. Use Effect.fn('name')(function*() {...}) with a span name.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        if (!AST.isCallOf(node as ESTree.CallExpression, "Effect", "fn")) return Effect.void

        // Effect.fn(function*() {...}) — single arg that's a generator
        if (
          "arguments" in node &&
          Array.isArray(node.arguments) &&
          node.arguments.length === 1
        ) {
          const arg = node.arguments[0]
          if (
            arg != null &&
            typeof arg === "object" &&
            "type" in arg &&
            arg.type === "FunctionExpression" &&
            "generator" in arg &&
            arg.generator === true
          ) {
            return ctx.report(
              Diagnostic.make({
                node,
                message:
                  "Use Effect.fn('spanName')(function*() {...}) — provide a trace span name.",
              }),
            )
          }
        }
        return Effect.void
      },
    }
  },
})

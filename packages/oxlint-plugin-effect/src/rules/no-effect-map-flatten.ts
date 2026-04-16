/**
 * Ban `.map(f).flatMap(g)` — use `.flatMap(x => g(f(x)))` or refactor.
 *
 * Detects `.pipe(Effect.map(f), Effect.flatMap(g))` chains where
 * the map + flatMap can be fused.
 *
 * Source: language-service/effectMapFlatten
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

const isEffectMap = (node: ESTree.Node): boolean => {
  if (node.type !== "CallExpression") return false
  return Option.isSome(AST.matchCallOf(node as ESTree.CallExpression, "Effect", "map"))
}

const isEffectFlatMap = (node: ESTree.Node): boolean => {
  if (node.type !== "CallExpression") return false
  return Option.isSome(AST.matchCallOf(node as ESTree.CallExpression, "Effect", "flatMap"))
}

const hasMapFlatMapSequence = (args: ReadonlyArray<ESTree.Node>): boolean => {
  for (let i = 0; i < args.length - 1; i++) {
    const a = args[i]; const b = args[i + 1]; if (a && b && isEffectMap(a) && isEffectFlatMap(b)) return true
  }
  return false
}

export const noEffectMapFlatten = Rule.define({
  name: "no-effect-map-flatten",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid Effect.map followed by Effect.flatMap in pipe. Fuse into a single Effect.flatMap.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        const call = node as ESTree.CallExpression
        const args = call.arguments

        // Bare pipe(value, Effect.map(f), Effect.flatMap(g))
        const calleeName = Option.getOrUndefined(AST.calleeName(call))
        if (calleeName === "pipe" && hasMapFlatMapSequence(args as ReadonlyArray<ESTree.Node>)) {
          return ctx.report(
            Diagnostic.make({
              node,
              message:
                "Effect.map followed by Effect.flatMap can be fused into a single Effect.flatMap.",
            }),
          )
        }

        // .pipe(Effect.map(f), Effect.flatMap(g))
        const calleeNode = call.callee
        if (calleeNode.type === "MemberExpression") {
          const prop = (calleeNode as unknown as Record<string, unknown>)["property"]
          if (
            prop != null &&
            typeof prop === "object" &&
            "name" in prop &&
            prop.name === "pipe" &&
            hasMapFlatMapSequence(args as ReadonlyArray<ESTree.Node>)
          ) {
            return ctx.report(
              Diagnostic.make({
                node,
                message:
                  "Effect.map followed by Effect.flatMap can be fused into a single Effect.flatMap.",
              }),
            )
          }
        }

        return Effect.void
      },
    }
  },
})

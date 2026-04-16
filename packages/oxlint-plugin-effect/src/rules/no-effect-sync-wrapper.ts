/**
 * Warn on `Effect.sync(() => someCall(...))` wrapping a plain function call.
 *
 * Consider whether the wrapped call truly needs to be in Effect.sync.
 *
 * Source: biome-effect-linting-rules/warn-effect-sync-wrapper
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

export const noEffectSyncWrapper = Rule.define({
  name: "no-effect-sync-wrapper",
  meta: Rule.meta({
    type: "suggestion",
    description: "Effect.sync wrapping a plain call. Consider if Effect.sync is necessary.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        if (!AST.isCallOf(node as ESTree.CallExpression, "Effect", "sync")) return Effect.void

        if (!("arguments" in node) || !Array.isArray(node.arguments) || node.arguments.length < 1)
          return Effect.void

        const arg = node.arguments[0]
        if (arg == null || typeof arg !== "object" || !("type" in arg)) return Effect.void

        // () => someCall(...)
        if (arg.type === "ArrowFunctionExpression" && "body" in arg) {
          const body = arg.body
          if (
            body != null &&
            typeof body === "object" &&
            "type" in body &&
            body.type === "CallExpression"
          ) {
            // Exclude console.* (handled by no-effect-sync-console)
            const callee = (body as unknown as Record<string, unknown>)["callee"]
            if (
              callee != null &&
              typeof callee === "object" &&
              "type" in callee &&
              callee.type === "MemberExpression" &&
              "object" in callee &&
              callee.object != null &&
              typeof callee.object === "object" &&
              "name" in callee.object &&
              callee.object.name === "console"
            ) {
              return Effect.void
            }

            return ctx.report(
              Diagnostic.make({
                node,
                message: "Effect.sync wrapping a plain function call. Consider if Effect.sync is necessary.",
              }),
            )
          }
        }
        return Effect.void
      },
    }
  },
})

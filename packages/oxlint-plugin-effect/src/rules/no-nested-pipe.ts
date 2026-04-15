/**
 * Ban nested `pipe()` calls — `pipe(pipe(...), ...)` or `.pipe(...).pipe(...)`.
 *
 * Flatten into a single pipeline.
 *
 * Sources: biome-effect-linting-rules/no-pipe-ladder, language-service/unnecessaryPipeChain
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, Visitor } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { pipe } from "effect/Function"

const isPipeCall = (node: ESTree.Node): boolean => {
  if (node.type === "CallExpression" && "callee" in node) {
    const callee = (node as unknown as Record<string, unknown>)["callee"]
    if (callee != null && typeof callee === "object" && "type" in callee) {
      // pipe(...)
      if (callee.type === "Identifier" && "name" in callee && callee.name === "pipe") {
        return true
      }
      // x.pipe(...)
      if (
        callee.type === "MemberExpression" &&
        "property" in callee &&
        callee.property != null &&
        typeof callee.property === "object" &&
        "type" in callee.property &&
        callee.property.type === "Identifier" &&
        "name" in callee.property &&
        callee.property.name === "pipe"
      ) {
        return true
      }
    }
  }
  return false
}

export const noNestedPipe = Rule.define({
  name: "no-nested-pipe",
  meta: Rule.meta({
    type: "suggestion",
    description: "Avoid nested pipe() calls. Flatten into a single pipeline.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        if (!isPipeCall(node)) return Effect.void

        // Check if any argument is itself a pipe call
        if ("arguments" in node && Array.isArray(node.arguments)) {
          for (const arg of node.arguments) {
            if (
              arg != null &&
              typeof arg === "object" &&
              "type" in arg &&
              isPipeCall(arg as unknown as ESTree.Node)
            ) {
              return ctx.report(
                Diagnostic.make({
                  node: arg,
                  message:
                    "Nested pipe() detected. Flatten into a single pipeline.",
                }),
              )
            }
          }
        }
        return Effect.void
      },
    }
  },
})

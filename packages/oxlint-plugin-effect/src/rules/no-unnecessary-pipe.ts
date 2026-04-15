/**
 * Ban `pipe(x)` with zero pipe arguments.
 *
 * Just use `x` directly.
 *
 * Source: language-service/unnecessaryPipe
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

export const noUnnecessaryPipe = Rule.define({
  name: "no-unnecessary-pipe",
  meta: Rule.meta({
    type: "suggestion",
    description: "Unnecessary pipe() with single argument. Use the value directly.",
    fixable: "code",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        // Match pipe(x) — bare pipe call with exactly one arg
        const name = Option.getOrUndefined(AST.calleeName(node as ESTree.CallExpression))
        if (name !== "pipe") return Effect.void

        if (
          "arguments" in node &&
          Array.isArray(node.arguments) &&
          node.arguments.length === 1
        ) {
          return ctx.report(
            Diagnostic.make({
              node,
              message:
                "Unnecessary pipe() with single argument. Use the value directly.",
            }),
          )
        }
        return Effect.void
      },
    }
  },
})

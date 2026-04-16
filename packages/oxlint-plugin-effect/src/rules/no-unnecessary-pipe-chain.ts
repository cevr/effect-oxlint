/**
 * Ban `x.pipe(f).pipe(g)` — merge into `x.pipe(f, g)`.
 *
 * Source: language-service/unnecessaryPipeChain
 */
import type { ESTree } from "@oxlint/plugins"
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

const isMethodPipe = (node: ESTree.Node): boolean => {
  if (node.type !== "CallExpression") return false
  const callee = (node as unknown as Record<string, unknown>)["callee"]
  if (callee == null || typeof callee !== "object" || !("type" in callee)) return false
  if (callee.type !== "MemberExpression") return false
  const prop = (callee as unknown as Record<string, unknown>)["property"]
  if (prop == null || typeof prop !== "object" || !("type" in prop)) return false
  return prop.type === "Identifier" && "name" in prop && prop.name === "pipe"
}

export const noUnnecessaryPipeChain = Rule.define({
  name: "no-unnecessary-pipe-chain",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid chaining .pipe().pipe(). Merge into a single .pipe() call.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        if (!isMethodPipe(node)) return Effect.void
        const callee = (node as unknown as Record<string, unknown>)["callee"] as Record<string, unknown>
        const obj = callee["object"]
        if (obj != null && typeof obj === "object" && isMethodPipe(obj as ESTree.Node)) {
          return ctx.report(
            Diagnostic.make({
              node,
              message:
                "Unnecessary .pipe() chain. Merge into a single .pipe() call.",
            }),
          )
        }
        return Effect.void
      },
    }
  },
})

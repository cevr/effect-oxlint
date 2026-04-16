/**
 * Ban `console.*` inside `Effect.sync(...)`.
 *
 * Use Effect.log* instead.
 *
 * Source: biome-effect-linting-rules/no-effect-sync-console
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

const consoleMethods = new Set(["log", "warn", "error", "info", "debug", "trace"])

const containsConsoleCall = (node: unknown): boolean => {
  if (node == null || typeof node !== "object") return false
  const n = node as Record<string, unknown>
  if (
    n["type"] === "CallExpression" &&
    "callee" in n &&
    n["callee"] != null &&
    typeof n["callee"] === "object"
  ) {
    const callee = n["callee"] as Record<string, unknown>
    if (
      callee["type"] === "MemberExpression" &&
      "object" in callee &&
      "property" in callee
    ) {
      const obj = callee["object"] as Record<string, unknown> | null
      const prop = callee["property"] as Record<string, unknown> | null
      if (
        obj != null && obj["type"] === "Identifier" && obj["name"] === "console" &&
        prop != null && prop["type"] === "Identifier" && typeof prop["name"] === "string" &&
        consoleMethods.has(prop["name"])
      ) {
        return true
      }
    }
  }
  // Recurse into body/arguments
  if ("body" in n) {
    if (Array.isArray(n["body"])) {
      for (const child of n["body"]) {
        if (containsConsoleCall(child)) return true
      }
    } else if (containsConsoleCall(n["body"])) return true
  }
  if ("argument" in n && containsConsoleCall(n["argument"])) return true
  if ("arguments" in n && Array.isArray(n["arguments"])) {
    for (const arg of n["arguments"]) {
      if (containsConsoleCall(arg)) return true
    }
  }
  if ("expression" in n && containsConsoleCall(n["expression"])) return true
  if ("expressions" in n && Array.isArray(n["expressions"])) {
    for (const expr of n["expressions"]) {
      if (containsConsoleCall(expr)) return true
    }
  }
  return false
}

export const noEffectSyncConsole = Rule.define({
  name: "no-effect-sync-console",
  meta: Rule.meta({
    type: "suggestion",
    description: "Avoid console.* inside Effect.sync. Use Effect.log* instead.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        if (!AST.isCallOf(node as ESTree.CallExpression, "Effect", "sync")) return Effect.void

        if ("arguments" in node && Array.isArray(node.arguments)) {
          for (const arg of node.arguments) {
            if (containsConsoleCall(arg)) {
              return ctx.report(
                Diagnostic.make({
                  node,
                  message: "Avoid console.* inside Effect.sync. Use Effect.log, Effect.logWarning, etc.",
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

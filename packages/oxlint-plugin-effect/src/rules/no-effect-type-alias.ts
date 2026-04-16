/**
 * Ban `type X = Effect.Effect<...>` type aliases.
 *
 * Keep Effect types on service methods or inline at call site.
 *
 * Source: biome-effect-linting-rules/no-effect-type-alias
 */
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

const containsEffectType = (node: unknown): boolean => {
  if (node == null || typeof node !== "object") return false
  const n = node as Record<string, unknown>
  // TSTypeReference with Effect.Effect
  if (
    n["type"] === "TSTypeReference" &&
    "typeName" in n &&
    n["typeName"] != null &&
    typeof n["typeName"] === "object"
  ) {
    const typeName = n["typeName"] as Record<string, unknown>
    if (
      typeName["type"] === "TSQualifiedName" &&
      "left" in typeName && "right" in typeName
    ) {
      const left = typeName["left"] as Record<string, unknown> | null
      const right = typeName["right"] as Record<string, unknown> | null
      if (
        left != null && left["type"] === "Identifier" && left["name"] === "Effect" &&
        right != null && right["type"] === "Identifier" && right["name"] === "Effect"
      ) {
        return true
      }
    }
  }
  // Recurse into typeAnnotation, typeParameters
  if ("typeAnnotation" in n && containsEffectType(n["typeAnnotation"])) return true
  if ("typeParameters" in n && n["typeParameters"] != null && typeof n["typeParameters"] === "object") {
    const tp = n["typeParameters"] as Record<string, unknown>
    if ("params" in tp && Array.isArray(tp["params"])) {
      for (const p of tp["params"]) {
        if (containsEffectType(p)) return true
      }
    }
  }
  return false
}

export const noEffectTypeAlias = Rule.define({
  name: "no-effect-type-alias",
  meta: Rule.meta({
    type: "suggestion",
    description: "Avoid Effect type aliases. Keep Effect types on service methods or inline.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      TSTypeAliasDeclaration: (node) => {
        if ("typeAnnotation" in node && containsEffectType(node.typeAnnotation)) {
          return ctx.report(
            Diagnostic.make({
              node,
              message: "Avoid type alias wrapping Effect.Effect. Let Effect types flow from service methods.",
            }),
          )
        }
        return Effect.void
      },
    }
  },
})

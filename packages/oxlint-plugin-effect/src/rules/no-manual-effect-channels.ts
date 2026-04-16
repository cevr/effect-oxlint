/**
 * Ban manual `Effect.Effect<A, E, R>` type annotations.
 *
 * Let return types infer from the Effect/Layer you return.
 *
 * Source: biome-effect-linting-rules/no-manual-effect-channels
 */
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"

export const noManualEffectChannels = Rule.define({
  name: "no-manual-effect-channels",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid manual Effect.Effect<A, E, R> annotations. Let types infer from the returned Effect.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      TSTypeReference: (node) => {
        if (!("typeName" in node) || node.typeName == null) return Effect.void
        const typeName = node.typeName as unknown as Record<string, unknown>

        // Effect.Effect<...> or Layer.Layer<...>
        if (typeName["type"] === "TSQualifiedName" && "left" in typeName && "right" in typeName) {
          const left = typeName["left"] as unknown as Record<string, unknown> | null
          const right = typeName["right"] as unknown as Record<string, unknown> | null
          if (
            left != null && left["type"] === "Identifier" &&
            (left["name"] === "Effect" || left["name"] === "Layer") &&
            right != null && right["type"] === "Identifier" &&
            (right["name"] === "Effect" || right["name"] === "Layer")
          ) {
            // Only flag if explicit type parameters are provided
            if (
              "typeParameters" in node &&
              node.typeParameters != null &&
              typeof node.typeParameters === "object" &&
              "params" in (node.typeParameters as unknown as Record<string, unknown>) &&
              Array.isArray((node.typeParameters as unknown as Record<string, unknown>)["params"]) &&
              ((node.typeParameters as unknown as Record<string, unknown>)["params"] as unknown[]).length > 0
            ) {
              return ctx.report(
                Diagnostic.make({
                  node,
                  message:
                    "Avoid manual Effect/Layer channel annotations. Let types infer from the returned value.",
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

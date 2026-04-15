/**
 * Ban `Effect.async`.
 *
 * Use `Stream` or structured Effect lifecycles (acquire/use/release).
 *
 * Source: biome-effect-linting-rules/no-effect-async
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noEffectAsync = Rule.banMember("Effect", "async", {
  message:
    "Avoid Effect.async. Use Stream or structured Effect lifecycles.",
  meta: { type: "suggestion" },
})

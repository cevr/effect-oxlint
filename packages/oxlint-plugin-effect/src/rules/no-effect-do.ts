/**
 * Ban `Effect.Do` — the builder/do-notation entry point.
 *
 * Use flat pipe-based flow or `Effect.gen` instead.
 *
 * Sources: biome-effect-linting-rules/no-effect-do, language-service/effectDoNotation
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noEffectDo = Rule.banMember("Effect", "Do", {
  message:
    "Avoid Effect.Do builder notation. Use flat pipe-based flow or Effect.gen.",
  meta: { type: "suggestion" },
})

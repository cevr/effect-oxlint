/**
 * Ban `Effect.as`.
 *
 * Use `Effect.map` for value mapping or `Effect.asVoid` after explicit steps.
 *
 * Source: biome-effect-linting-rules/no-effect-as
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noEffectAs = Rule.banMember("Effect", "as", {
  message:
    "Avoid Effect.as. Use Effect.map for value mapping or Effect.asVoid.",
  meta: { type: "suggestion" },
})

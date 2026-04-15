/**
 * Ban `Effect.bind`.
 *
 * Use flat pipe or direct top-level `Effect.gen` with yields.
 *
 * Source: biome-effect-linting-rules/no-effect-bind
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noEffectBind = Rule.banMember("Effect", "bind", {
  message: "Avoid Effect.bind. Use flat pipe or Effect.gen with yields.",
  meta: { type: "suggestion" },
})

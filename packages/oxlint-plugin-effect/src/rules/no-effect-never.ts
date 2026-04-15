/**
 * Ban `Effect.never`.
 *
 * Use `Stream` or explicit acquire/release lifecycles instead.
 *
 * Source: biome-effect-linting-rules/no-effect-never
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noEffectNever = Rule.banMember("Effect", "never", {
  message:
    "Avoid Effect.never. Use Stream or explicit acquire/release lifecycles.",
  meta: { type: "suggestion" },
})

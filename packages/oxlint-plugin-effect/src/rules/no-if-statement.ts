/**
 * Ban `if` statements in Effect codebases.
 *
 * Use `Option.match`, `Either.match`, `Match.value`, or data combinators.
 *
 * Source: biome-effect-linting-rules/no-if-statement
 *
 * Note: Very opinionated — recommended for strict functional presets only.
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noIfStatement = Rule.banStatement("IfStatement", {
  message:
    "Avoid if statements. Use Option.match, Either.match, Match.value, or Effect.if.",
  meta: { type: "suggestion" },
})

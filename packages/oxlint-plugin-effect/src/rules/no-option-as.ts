/**
 * Ban `Option.as`.
 *
 * Use `Option.map` or `Option.match` with explicit value return.
 *
 * Source: biome-effect-linting-rules/no-option-as
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noOptionAs = Rule.banMember("Option", "as", {
  message: "Avoid Option.as. Use Option.map or Option.match instead.",
  meta: { type: "suggestion" },
})

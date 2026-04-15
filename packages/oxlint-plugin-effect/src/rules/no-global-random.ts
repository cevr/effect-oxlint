/**
 * Ban `Math.random()`.
 *
 * Use Effect Random service instead.
 *
 * Source: language-service/globalRandom
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noGlobalRandom = Rule.banMember("Math", "random", {
  message: "Avoid Math.random(). Use Random service.",
  meta: { type: "suggestion" },
})

/**
 * Ban `setTimeout` and `setInterval`.
 *
 * Use Effect Schedule or Effect.sleep instead.
 *
 * Source: language-service/globalTimers
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noGlobalTimers = Rule.banCallOf(
  ["setTimeout", "setInterval"],
  {
    message:
      "Avoid setTimeout/setInterval. Use Effect.sleep or Schedule.",
    meta: { type: "suggestion" },
  },
)

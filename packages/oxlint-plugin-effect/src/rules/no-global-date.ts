/**
 * Ban `Date.now()` and `new Date()`.
 *
 * Use Effect Clock service instead.
 *
 * Source: language-service/globalDate
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noGlobalDate = Rule.banMultiple(
  {
    newExprs: "Date",
    members: [["Date", "now"]],
  },
  {
    name: "no-global-date",
    message: "Avoid Date.now() and new Date(). Use Clock service.",
    meta: { type: "suggestion" },
  },
)

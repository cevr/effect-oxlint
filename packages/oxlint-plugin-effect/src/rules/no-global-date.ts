/**
 * Ban `Date.now()` and `new Date()`.
 *
 * Use Effect Clock service instead.
 *
 * Source: language-service/globalDate
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noGlobalDate = Rule.banMultiple({
  name: "no-global-date",
  meta: { type: "suggestion" },
  specs: [
    { type: "new", name: "Date", message: "Avoid new Date(). Use Clock service from 'effect'." },
    { type: "member", object: "Date", property: "now", message: "Avoid Date.now(). Use Clock service from 'effect'." },
  ],
})

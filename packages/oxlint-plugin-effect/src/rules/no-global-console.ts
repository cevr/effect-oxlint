/**
 * Ban `console.log/warn/error/info/debug/trace`.
 *
 * Use Effect Logger service instead.
 *
 * Source: language-service/globalConsole
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noGlobalConsole = Rule.banMember(
  "console",
  ["log", "warn", "error", "info", "debug", "trace"],
  {
    message: "Avoid console.*. Use Effect Logger service.",
    meta: { type: "suggestion" },
  },
)

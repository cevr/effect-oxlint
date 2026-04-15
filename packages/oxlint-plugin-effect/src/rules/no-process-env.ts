/**
 * Ban `process.env` access.
 *
 * Use Effect Config service instead.
 *
 * Source: language-service/processEnv
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noProcessEnv = Rule.banMember("process", "env", {
  message: "Avoid process.env. Use Effect Config service.",
  meta: { type: "suggestion" },
})

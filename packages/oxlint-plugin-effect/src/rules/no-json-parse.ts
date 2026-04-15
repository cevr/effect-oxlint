/**
 * Ban `JSON.parse` and `JSON.stringify`.
 *
 * Use Schema.fromJsonString for type-safe JSON handling.
 *
 * Source: language-service/preferSchemaOverJson
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noJsonParse = Rule.banMember(
  "JSON",
  ["parse", "stringify"],
  {
    message:
      "Avoid JSON.parse/stringify. Use Schema.fromJsonString for type-safe JSON.",
    meta: { type: "suggestion" },
  },
)

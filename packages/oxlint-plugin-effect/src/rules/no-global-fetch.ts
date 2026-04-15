/**
 * Ban bare `fetch()` calls.
 *
 * Use Effect HttpClient service instead.
 *
 * Source: language-service/globalFetch
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noGlobalFetch = Rule.banCallOf("fetch", {
  message:
    "Avoid global fetch. Use HttpClient from 'effect/unstable/http'.",
  meta: { type: "suggestion" },
})

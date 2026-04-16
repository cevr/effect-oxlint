/**
 * Ban `try/catch` statements.
 *
 * Model failures in Effect's typed error channel.
 *
 * Source: biome-effect-linting-rules/no-try-catch, language-service/tryCatchInEffectGen
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noTryCatch = Rule.banStatement("TryStatement", {
  message:
    "Avoid try/catch. Use Effect.try({ try: () => ..., catch: (e) => new MyError({ cause: e }) }) or Effect.tryPromise for async operations.",
  meta: { type: "suggestion" },
})

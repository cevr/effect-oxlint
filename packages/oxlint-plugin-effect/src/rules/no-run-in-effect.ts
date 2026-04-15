/**
 * Ban `Effect.runSync`, `Effect.runPromise`, `Effect.runFork`, `Effect.runCallback`.
 *
 * Inside Effect context, use Runtime or Effect.services pattern.
 *
 * Source: language-service/runEffectInsideEffect
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noRunInEffect = Rule.banMember(
  "Effect",
  ["runSync", "runPromise", "runFork", "runCallback"],
  {
    message:
      "Avoid Effect.run* calls. Use Effect.services (v4) or Runtime pattern instead.",
    meta: { type: "problem" },
  },
)

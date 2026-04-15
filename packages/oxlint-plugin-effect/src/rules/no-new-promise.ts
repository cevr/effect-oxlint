/**
 * Ban `new Promise(...)`.
 *
 * Use Effect.async, Effect.tryPromise, or Effect.promise instead.
 *
 * Source: language-service/newPromise
 */
import { Rule } from "../vendor/effect-oxlint/index.js"

export const noNewPromise = Rule.banNewExpr("Promise", {
  message:
    "Avoid new Promise(). Use Effect.async, Effect.tryPromise, or Effect.promise.",
  meta: { type: "suggestion" },
})

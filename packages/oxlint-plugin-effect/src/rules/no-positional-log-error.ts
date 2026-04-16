/**
 * Ban positional error/cause arguments in Effect.log* calls.
 *
 * `Effect.logWarning("message", error)` loses error structure.
 * Use `Effect.logWarning("message").pipe(Effect.annotateLogs({ error }))` instead,
 * or pass cause via `Effect.logWarning("message", Cause.fail(error))`.
 *
 * Source: agent session analysis — 57 occurrences across 6 projects
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Diagnostic, Rule } from "../vendor/effect-oxlint/index.js"
import { RuleContext } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

const logMethods = new Set([
  "log",
  "logDebug",
  "logInfo",
  "logWarning",
  "logError",
  "logFatal",
  "logTrace",
])

export const noPositionalLogError = Rule.define({
  name: "no-positional-log-error",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Avoid passing errors as positional arguments to Effect.log*. Use Effect.annotateLogs instead.",
  }),
  create: function* () {
    const ctx = yield* RuleContext
    return {
      CallExpression: (node) => {
        const call = node as ESTree.CallExpression
        const names = Option.getOrUndefined(
          AST.memberNames(call.callee as ESTree.MemberExpression),
        )
        if (names === undefined) return Effect.void
        const [obj, prop] = names
        if (obj !== "Effect") return Effect.void
        if (!logMethods.has(prop)) return Effect.void

        // Effect.log* with more than 1 argument — the second arg is likely
        // an error/cause being passed positionally
        const args = call.arguments
        if (args.length < 2) return Effect.void

        // The first arg should be a string message. If second arg exists,
        // it's likely an error being passed positionally.
        const secondArg = args[1]!

        // Allow Cause.fail/Cause.die as second arg (that's the proper API)
        if (secondArg.type === "CallExpression") {
          const secondNames = Option.getOrUndefined(
            AST.memberNames((secondArg as ESTree.CallExpression).callee as ESTree.MemberExpression),
          )
          if (secondNames !== undefined) {
            const [sObj] = secondNames
            if (sObj === "Cause") return Effect.void
          }
        }

        return ctx.report(
          Diagnostic.make({
            node: secondArg,
            message:
              `Avoid passing errors as positional args to Effect.${prop}. Use .pipe(Effect.annotateLogs({ error: String(err) })) or pass a Cause.`,
          }),
        )
      },
    }
  },
})

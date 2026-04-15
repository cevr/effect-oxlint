/**
 * Shared utilities for rules that need to detect "inside Effect context"
 * (i.e., inside an Effect.gen or Effect.fn generator body).
 *
 * Uses Visitor.tracked to maintain a depth counter.
 */
import type { ESTree } from "@oxlint/plugins"
import { AST, Visitor } from "../vendor/effect-oxlint/index.js"
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"

/**
 * Check if a CallExpression is Effect.gen or Effect.fn.
 * Both patterns establish an "Effect context" where globals should be avoided.
 */
export const isEffectContext = (node: ESTree.CallExpression): boolean =>
  AST.isCallOf(node, "Effect", "gen") || AST.isCallOf(node, "Effect", "fn")

/**
 * Create a tracked visitor pair for Effect context depth.
 * Returns [depthRef, trackerVisitor] so rules can merge the tracker
 * and read the depth in their own handlers.
 */
export const makeEffectContextTracker = Effect.gen(function* () {
  const depth = yield* Ref.make(0)
  const tracker = Visitor.tracked("CallExpression", isEffectContext, depth)
  return [depth, tracker] as const
})

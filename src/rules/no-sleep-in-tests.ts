/**
 * Ban fixed sleeps in tests.
 *
 * Tests should wait on deterministic synchronization primitives instead of
 * wall-clock delays. Opt out with `effect/no-sleep-in-tests: allow <reason>`.
 */
import type { Comment, ESTree } from "@oxlint/plugins";
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import type { EffectVisitor } from "../vendor/effect-oxlint/Visitor.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

interface AstNode {
  readonly type: string;
  readonly [key: string]: unknown;
}

const allowPattern = /\beffect\/no-sleep-in-tests:\s*allow\s+\S/;

const isTestFilename = (filename: string): boolean =>
  /\.test\.tsx?$/.test(filename) || /\/tests\/.*\.[cm]?tsx?$/.test(filename);

const getLine = (node: AstNode, edge: "start" | "end"): number | undefined => {
  const loc = node["loc"];
  if (typeof loc !== "object" || loc === null) return undefined;
  const point = (loc as Record<string, unknown>)[edge];
  if (typeof point !== "object" || point === null) return undefined;
  const line = (point as Record<string, unknown>)["line"];
  return typeof line === "number" ? line : undefined;
};

const hasAllowComment = (node: ESTree.Node, comments: ReadonlyArray<Comment>): boolean => {
  const startLine = getLine(node as unknown as AstNode, "start");
  if (startLine === undefined) return false;
  return comments.some((comment) => {
    const endLine = getLine(comment as unknown as AstNode, "end");
    if (endLine === undefined) return false;
    if (endLine !== startLine - 1 && endLine !== startLine) return false;
    return allowPattern.test(comment.value);
  });
};

export const noSleepInTests = Rule.define({
  name: "no-sleep-in-tests",
  meta: Rule.meta({
    type: "problem",
    description: "Avoid fixed sleeps in tests. Use deterministic synchronization.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (!isTestFilename(ctx.filename)) return {} as EffectVisitor;

    return {
      CallExpression: (node: ESTree.Node) => {
        const call = node as ESTree.CallExpression;
        if (call.callee.type !== "MemberExpression") return Effect.void;
        const names = Option.getOrUndefined(AST.memberNames(call.callee));
        if (names === undefined) return Effect.void;
        const [object, property] = names;
        if (property !== "sleep") return Effect.void;
        if (object !== "Effect" && object !== "Bun") return Effect.void;
        if (hasAllowComment(node, ctx.sourceCode.getAllComments())) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message: `Avoid ${object}.sleep(...) in tests. Wait on Deferred, polling helpers, or test controls instead of fixed delays.`,
          }),
        );
      },
    };
  },
});

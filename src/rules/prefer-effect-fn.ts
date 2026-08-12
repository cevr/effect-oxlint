/** Require Effect.fn for named generator operations. */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";

const isStaticMember = (
  node: ESTree.Expression,
  object: string,
  property: string,
): node is ESTree.MemberExpression =>
  node.type === "MemberExpression" &&
  !node.computed &&
  node.object.type === "Identifier" &&
  node.object.name === object &&
  node.property.type === "Identifier" &&
  node.property.name === property;

const isEffectGenCall = (node: ESTree.Expression): node is ESTree.CallExpression =>
  node.type === "CallExpression" &&
  node.callee.type !== "Super" &&
  isStaticMember(node.callee, "Effect", "gen");

const isEffectWithSpanCall = (node: ESTree.CallExpression["arguments"][number]): boolean =>
  node.type === "CallExpression" &&
  node.callee.type !== "Super" &&
  isStaticMember(node.callee, "Effect", "withSpan");

const spansEffectGenDirectly = (node: ESTree.CallExpression): boolean =>
  node.callee.type !== "Super" &&
  node.callee.type === "MemberExpression" &&
  !node.callee.computed &&
  node.callee.property.type === "Identifier" &&
  node.callee.property.name === "withSpan" &&
  isEffectGenCall(node.callee.object);

const pipesOnlyWithSpanFromEffectGen = (node: ESTree.CallExpression): boolean =>
  node.callee.type !== "Super" &&
  node.callee.type === "MemberExpression" &&
  !node.callee.computed &&
  node.callee.property.type === "Identifier" &&
  node.callee.property.name === "pipe" &&
  isEffectGenCall(node.callee.object) &&
  node.arguments.length === 1 &&
  node.arguments[0] !== undefined &&
  isEffectWithSpanCall(node.arguments[0]);

export const preferEffectFn = Rule.define({
  name: "prefer-effect-fn",
  meta: Rule.meta({
    type: "suggestion",
    description: "Use Effect.fn for a named generator operation.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;

    return {
      CallExpression: (node) => {
        if (node.type !== "CallExpression") return Effect.void;
        if (!spansEffectGenDirectly(node) && !pipesOnlyWithSpanFromEffectGen(node)) {
          return Effect.void;
        }
        return ctx.report(
          Diagnostic.make({
            node,
            message: "Avoid a span on Effect.gen. Define the named operation with Effect.fn.",
          }),
        );
      },
    };
  },
});

/**
 * Ban sequential stateful steps hidden in `Effect.all(..., { concurrency: 1 })`.
 * `Effect.all` should aggregate independent values, not spell an imperative list.
 *
 * Source: biome-effect-linting-rules/no-effect-all-step-sequencing
 */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";

interface AstNode {
  readonly type: string;
  readonly [key: string]: unknown;
}

const isAstNode = (value: unknown): value is AstNode =>
  typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";

const statefulSteps = new Set([
  "Atom.set",
  "Effect.log",
  "Effect.logDebug",
  "Effect.logError",
  "Effect.logFatal",
  "Effect.logInfo",
  "Effect.logTrace",
  "Effect.logWarning",
  "Fiber.interrupt",
  "Reactivity.invalidate",
  "Ref.set",
  "SubscriptionRef.set",
]);

const memberName = (value: unknown): string | undefined => {
  if (!isAstNode(value) || value.type !== "MemberExpression") return undefined;
  const object = value["object"];
  const property = value["property"];
  if (!isAstNode(object) || !isAstNode(property)) return undefined;
  if (object.type !== "Identifier" || property.type !== "Identifier") return undefined;
  return typeof object["name"] === "string" && typeof property["name"] === "string"
    ? `${object["name"]}.${property["name"]}`
    : undefined;
};

const containsStatefulStep = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsStatefulStep);
  if (!isAstNode(value)) return false;
  if (value.type === "CallExpression" && statefulSteps.has(memberName(value["callee"]) ?? "")) {
    return true;
  }
  return Object.entries(value).some(
    ([key, child]) => key !== "parent" && containsStatefulStep(child),
  );
};

const hasSequentialConcurrency = (value: unknown): boolean => {
  if (!isAstNode(value) || value.type !== "ObjectExpression") return false;
  const properties = Array.isArray(value["properties"]) ? value["properties"] : [];
  return properties.some((property) => {
    if (!isAstNode(property) || property.type !== "Property") return false;
    const key = property["key"];
    const propertyValue = property["value"];
    return (
      isAstNode(key) &&
      (key["name"] === "concurrency" || key["value"] === "concurrency") &&
      isAstNode(propertyValue) &&
      propertyValue["value"] === 1
    );
  });
};

export const noEffectAllStepSequencing = Rule.define({
  name: "no-effect-all-step-sequencing",
  meta: Rule.meta({
    type: "suggestion",
    description: "Use a linear Effect pipeline for sequential stateful steps.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    return {
      CallExpression: (node: ESTree.CallExpression) => {
        if (memberName(node.callee) !== "Effect.all" || node.arguments.length < 2) {
          return Effect.void;
        }
        return hasSequentialConcurrency(node.arguments[1]) &&
          containsStatefulStep(node.arguments[0])
          ? ctx.report(
              Diagnostic.make({
                node,
                message:
                  "Avoid Effect.all for sequential side-effect steps. Use one explicit linear pipeline with Effect.andThen or Effect.flatMap.",
              }),
            )
          : Effect.void;
      },
    };
  },
});

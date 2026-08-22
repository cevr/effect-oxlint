/** Require an explicit bound on retry schedules. */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import {
  importedNamespaces,
  isStaticCall,
  isStaticMember,
  visibleNamespaces,
} from "./_effect-namespaces.js";

const unboundedConstructors = new Set(["exponential", "fibonacci", "spaced"]);
const boundedCombinators = new Set(["take"]);

const staticPropertyName = (node: ESTree.Expression): string | undefined => {
  if (node.type !== "MemberExpression" || node.computed || node.property.type !== "Identifier") {
    return undefined;
  }
  return node.property.name;
};

const hasOwnProperty = (node: ESTree.ObjectExpression, name: string): boolean => {
  for (const property of node.properties) {
    if (property.type !== "Property" || property.computed) continue;
    if (property.key.type === "Identifier" && property.key.name === name) return true;
    if (property.key.type === "Literal" && property.key.value === name) return true;
  }
  return false;
};

const propertyValue = (
  node: ESTree.ObjectExpression,
  name: string,
): ESTree.Expression | undefined => {
  for (const property of node.properties) {
    if (property.type !== "Property" || property.computed) continue;
    const matches =
      (property.key.type === "Identifier" && property.key.name === name) ||
      (property.key.type === "Literal" && property.key.value === name);
    if (matches) return property.value;
  }
  return undefined;
};

const isBoundedOperation = (
  node: ESTree.CallExpression["arguments"][number],
  scheduleNamespaces: ReadonlySet<string>,
): boolean => {
  if (node.type !== "CallExpression" || node.callee.type === "Super") return false;
  const property = staticPropertyName(node.callee);
  if (property === undefined) return false;
  if (
    boundedCombinators.has(property) &&
    isStaticMember(node.callee, scheduleNamespaces, property)
  ) {
    return true;
  }
  if (!isStaticMember(node.callee, scheduleNamespaces, "both")) return false;
  const bound = node.arguments[0];
  return (
    bound !== undefined &&
    bound.type !== "SpreadElement" &&
    isStaticCall(bound, scheduleNamespaces, "recurs")
  );
};

const unboundedSchedule = (
  node: ESTree.Expression,
  scheduleNamespaces: ReadonlySet<string>,
): ESTree.Node | undefined => {
  if (node.type === "MemberExpression" && isStaticMember(node, scheduleNamespaces, "forever")) {
    return node;
  }
  if (node.type !== "CallExpression" || node.callee.type === "Super") return undefined;
  const property = staticPropertyName(node.callee);
  if (
    property !== undefined &&
    unboundedConstructors.has(property) &&
    isStaticMember(node.callee, scheduleNamespaces, property)
  ) {
    return node;
  }
  if (property !== "pipe" || node.callee.type !== "MemberExpression") return undefined;
  const root = unboundedSchedule(node.callee.object, scheduleNamespaces);
  if (root === undefined) return undefined;
  for (const operation of node.arguments) {
    if (isBoundedOperation(operation, scheduleNamespaces)) return undefined;
  }
  return root;
};

const retryPolicy = (
  node: ESTree.CallExpression,
  effectNamespaces: ReadonlySet<string>,
  streamNamespaces: ReadonlySet<string>,
  httpClientNamespaces: ReadonlySet<string>,
): ESTree.Expression | undefined => {
  if (node.callee.type === "Super") return undefined;
  let policyIndex: number | undefined;
  if (isStaticMember(node.callee, effectNamespaces, "retry")) {
    if (node.arguments.length === 1) policyIndex = 0;
    if (node.arguments.length >= 2) policyIndex = 1;
  }
  if (isStaticMember(node.callee, effectNamespaces, "retryOrElse")) {
    if (node.arguments.length === 2) policyIndex = 0;
    if (node.arguments.length >= 3) policyIndex = 1;
  }
  if (isStaticMember(node.callee, streamNamespaces, "retry")) {
    if (node.arguments.length === 1) policyIndex = 0;
    if (node.arguments.length >= 2) policyIndex = 1;
  }
  if (isStaticMember(node.callee, httpClientNamespaces, "retryTransient")) {
    if (node.arguments.length === 1) policyIndex = 0;
    if (node.arguments.length >= 2) policyIndex = 1;
  }
  if (policyIndex === undefined) return undefined;
  const policy = node.arguments[policyIndex];
  if (policy?.type === "SpreadElement") return undefined;
  if (policy?.type !== "ObjectExpression") return policy;
  if (hasOwnProperty(policy, "times")) return undefined;
  return propertyValue(policy, "schedule");
};

export const noUnboundedRetry = Rule.define({
  name: "no-unbounded-retry",
  meta: Rule.meta({
    type: "problem",
    description: "Require retry policies to have an explicit attempt or duration bound.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const effectNamespaces = new Set(["Effect"]);
    const httpClientNamespaces = new Set(["HttpClient"]);
    const scheduleNamespaces = new Set(["Schedule"]);
    const streamNamespaces = new Set(["Stream"]);

    return {
      ImportDeclaration: (node) => {
        if (node.type !== "ImportDeclaration") return Effect.void;
        for (const name of importedNamespaces(node, "Effect", "effect/Effect")) {
          effectNamespaces.add(name);
        }
        for (const name of importedNamespaces(
          node,
          "HttpClient",
          "effect/unstable/http/HttpClient",
        )) {
          httpClientNamespaces.add(name);
        }
        for (const name of importedNamespaces(node, "Schedule", "effect/Schedule")) {
          scheduleNamespaces.add(name);
        }
        for (const name of importedNamespaces(node, "Stream", "effect/Stream")) {
          streamNamespaces.add(name);
        }
        return Effect.void;
      },
      CallExpression: (node) => {
        if (node.type !== "CallExpression") return Effect.void;
        const policy = retryPolicy(
          node,
          visibleNamespaces(ctx, node, effectNamespaces),
          visibleNamespaces(ctx, node, streamNamespaces),
          visibleNamespaces(ctx, node, httpClientNamespaces),
        );
        if (policy === undefined) return Effect.void;
        const unbounded = unboundedSchedule(
          policy,
          visibleNamespaces(ctx, node, scheduleNamespaces),
        );
        if (unbounded === undefined) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node: unbounded,
            message:
              "Bound retry attempts or elapsed time. Add times or compose the schedule with Schedule.recurs or Schedule.take.",
          }),
        );
      },
    };
  },
});

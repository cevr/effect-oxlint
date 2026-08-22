/** Do not collect a clearly unbounded Stream without a terminating operation. */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";

const unboundedSources = new Set(["fromPubSub", "fromPubSubTake", "fromQueue", "repeat"]);
const collectOperations = new Set(["runCollect"]);
const terminatingOperations = new Set([
  "take",
  "takeUntil",
  "takeUntilEffect",
  "takeWhile",
  "takeWhileEffect",
  "timeout",
  "timeoutOrElse",
]);

const staticOperation = (
  node: ESTree.CallExpression["arguments"][number],
  streamNamespaces: ReadonlySet<string>,
  operations: ReadonlySet<string>,
): boolean => {
  if (node.type === "SpreadElement") return false;
  const candidate =
    node.type === "CallExpression" && node.callee.type !== "Super" ? node.callee : node;
  for (const operation of operations) {
    if (isStaticMember(candidate, streamNamespaces, operation)) return true;
  }
  return false;
};

const unboundedRoot = (
  node: ESTree.Expression,
  streamNamespaces: ReadonlySet<string>,
): ESTree.Node | undefined => {
  if (node.type !== "CallExpression" || node.callee.type === "Super") return undefined;
  for (const source of unboundedSources) {
    if (isStaticMember(node.callee, streamNamespaces, source)) return node;
  }
  if (
    node.callee.type !== "MemberExpression" ||
    node.callee.computed ||
    node.callee.property.type !== "Identifier" ||
    node.callee.property.name !== "pipe"
  ) {
    return undefined;
  }
  const root = unboundedRoot(node.callee.object, streamNamespaces);
  if (root === undefined) return undefined;
  for (const operation of node.arguments) {
    if (staticOperation(operation, streamNamespaces, terminatingOperations)) return undefined;
  }
  return root;
};

const collectedSource = (
  node: ESTree.CallExpression,
  streamNamespaces: ReadonlySet<string>,
): ESTree.Expression | undefined => {
  if (node.callee.type === "Super") return undefined;
  const dataFirstRunCollect: boolean = isStaticMember(node.callee, streamNamespaces, "runCollect");
  if (dataFirstRunCollect) {
    const source = node.arguments[0];
    if (source !== undefined && source.type !== "SpreadElement") return source;
    return undefined;
  }
  if (
    node.callee.type !== "MemberExpression" ||
    node.callee.computed ||
    node.callee.property.type !== "Identifier" ||
    node.callee.property.name !== "pipe"
  ) {
    return undefined;
  }
  for (const operation of node.arguments) {
    if (staticOperation(operation, streamNamespaces, terminatingOperations)) return undefined;
  }
  for (const operation of node.arguments) {
    if (staticOperation(operation, streamNamespaces, collectOperations)) {
      return node.callee.object;
    }
  }
  return undefined;
};

export const noRunCollectOnUnboundedStream = Rule.define({
  name: "no-run-collect-on-unbounded-stream",
  meta: Rule.meta({
    type: "problem",
    description: "Do not collect a clearly unbounded Stream without a terminating operation.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const streamNamespaces = new Set(["Stream"]);

    return {
      ImportDeclaration: (node) => {
        if (node.type !== "ImportDeclaration") return Effect.void;
        for (const name of importedNamespaces(node, "Stream", "effect/Stream")) {
          streamNamespaces.add(name);
        }
        return Effect.void;
      },
      CallExpression: (node) => {
        if (node.type !== "CallExpression") return Effect.void;
        const namespaces = visibleNamespaces(ctx, node, streamNamespaces);
        const source = collectedSource(node, namespaces);
        if (source === undefined) return Effect.void;
        const root = unboundedRoot(source, namespaces);
        if (root === undefined) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node: root,
            message:
              "Do not collect a clearly unbounded Stream. Add a terminating operation or consume it with runForEach or runDrain.",
          }),
        );
      },
    };
  },
});

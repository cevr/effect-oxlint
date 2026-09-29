/** Do not collect a clearly unbounded Stream without a terminating operation. */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { expressionArgument } from "./_call-arguments.js";
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
  node: ESTree.Argument,
  streamNamespaces: ReadonlySet<string>,
  operations: ReadonlySet<string>,
): boolean => {
  if (node.type === "SpreadElement") return false;
  let candidate: ESTree.Expression = node;
  if (node.type === "CallExpression" && node.callee.type !== "Super") candidate = node.callee;
  for (const operation of operations) {
    if (isStaticMember(candidate, streamNamespaces, operation)) return true;
  }
  return false;
};

const isPipeMember = (node: ESTree.Expression): node is ESTree.MemberExpression =>
  node.type === "MemberExpression" &&
  !node.computed &&
  node.property.type === "Identifier" &&
  node.property.name === "pipe";

const pipesTerminatingOperation = (
  node: ESTree.CallExpression,
  streamNamespaces: ReadonlySet<string>,
): boolean =>
  node.arguments.some((operation) =>
    staticOperation(operation, streamNamespaces, terminatingOperations),
  );

const unboundedRoot = (
  node: ESTree.Expression,
  streamNamespaces: ReadonlySet<string>,
): Option.Option<ESTree.Node> => {
  if (node.type !== "CallExpression" || node.callee.type === "Super") return Option.none();
  for (const source of unboundedSources) {
    if (isStaticMember(node.callee, streamNamespaces, source)) return Option.some(node);
  }
  if (!isPipeMember(node.callee)) return Option.none();
  return Option.filter(
    unboundedRoot(node.callee.object, streamNamespaces),
    () => !pipesTerminatingOperation(node, streamNamespaces),
  );
};

const collectedSource = (
  node: ESTree.CallExpression,
  streamNamespaces: ReadonlySet<string>,
): Option.Option<ESTree.Expression> => {
  if (node.callee.type === "Super") return Option.none();
  const dataFirstRunCollect: boolean = isStaticMember(node.callee, streamNamespaces, "runCollect");
  if (dataFirstRunCollect) return expressionArgument(node, 0);
  if (!isPipeMember(node.callee) || pipesTerminatingOperation(node, streamNamespaces)) {
    return Option.none();
  }
  const collects = node.arguments.some((operation) =>
    staticOperation(operation, streamNamespaces, collectOperations),
  );
  if (!collects) return Option.none();
  return Option.some(node.callee.object);
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
        const root = Option.flatMap(collectedSource(node, namespaces), (source) =>
          unboundedRoot(source, namespaces),
        );
        return Option.match(root, {
          onNone: () => Effect.void,
          onSome: (stream) =>
            ctx.report(
              Diagnostic.make({
                node: stream,
                message:
                  "Do not collect a clearly unbounded Stream. Add a terminating operation or consume it with runForEach or runDrain.",
              }),
            ),
        });
      },
    };
  },
});

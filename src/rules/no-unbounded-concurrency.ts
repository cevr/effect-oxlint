/** Require finite concurrency for collections that can grow. */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { expressionArgument, staticProperties } from "./_call-arguments.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";

/** The first `concurrency: "unbounded"` value in an options object literal. */
const unboundedConcurrency = (node: ESTree.Expression): Option.Option<ESTree.Node> => {
  if (node.type !== "ObjectExpression") return Option.none();
  return Option.map(
    Arr.findFirst(
      staticProperties(node, "concurrency"),
      (property) => property.value.type === "Literal" && property.value.value === "unbounded",
    ),
    (property) => property.value,
  );
};

const fixedCollection = (node: ESTree.Argument): boolean =>
  node.type === "ArrayExpression" || node.type === "ObjectExpression";

/** Where `Effect.all` and `Effect.forEach` take their options. */
const optionsIndex = (
  callee: ESTree.Expression,
  effectNamespaces: ReadonlySet<string>,
): Option.Option<number> => {
  if (isStaticMember(callee, effectNamespaces, "forEach")) return Option.some(2);
  if (isStaticMember(callee, effectNamespaces, "all")) return Option.some(1);
  return Option.none();
};

export const noUnboundedConcurrency = Rule.define({
  name: "no-unbounded-concurrency",
  meta: Rule.meta({
    type: "problem",
    description: "Require finite concurrency for Effect operations over collections that can grow.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const effectNamespaces = new Set(["Effect"]);

    return {
      ImportDeclaration: (node) => {
        if (node.type !== "ImportDeclaration") return Effect.void;
        for (const name of importedNamespaces(node, "Effect", "effect/Effect")) {
          effectNamespaces.add(name);
        }
        return Effect.void;
      },
      CallExpression: (node) => {
        if (node.type !== "CallExpression" || node.callee.type === "Super") return Effect.void;
        const namespaces = visibleNamespaces(ctx, node, effectNamespaces);
        if (Option.exists(Arr.head(node.arguments), fixedCollection)) return Effect.void;
        const unbounded = Option.flatMap(optionsIndex(node.callee, namespaces), (index) =>
          Option.flatMap(expressionArgument(node, index), unboundedConcurrency),
        );
        return Option.match(unbounded, {
          onNone: () => Effect.void,
          onSome: (value) =>
            ctx.report(
              Diagnostic.make({
                node: value,
                message:
                  "Bound concurrency for a collection that can grow. Use a finite concurrency value.",
              }),
            ),
        });
      },
    };
  },
});

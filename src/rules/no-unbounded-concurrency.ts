/** Require finite concurrency for collections that can grow. */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { expressionArgument, staticProperties } from "./_call-arguments.js";
import { constResolver, type ResolveConst } from "./_const-bindings.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";

/** Whether an options object, inline or held in a const, sets `concurrency: "unbounded"`. */
const isUnboundedConcurrency = (argument: ESTree.Expression, resolve: ResolveConst): boolean => {
  const options = resolve(argument);
  if (options.type !== "ObjectExpression") return false;
  return staticProperties(options, "concurrency").some((property) => {
    const value = resolve(property.value);
    return value.type === "Literal" && value.value === "unbounded";
  });
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
    const resolve = constResolver(ctx);

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
        const unbounded = Option.exists(optionsIndex(node.callee, namespaces), (index) =>
          Option.exists(expressionArgument(node, index), (options) =>
            isUnboundedConcurrency(options, resolve),
          ),
        );
        if (!unbounded) return Effect.void;
        // Report the call, so a suppression sits above the call whatever the options' shape.
        return ctx.report(
          Diagnostic.make({
            node,
            message:
              "Bound concurrency for a collection that can grow. Use a finite concurrency value.",
          }),
        );
      },
    };
  },
});

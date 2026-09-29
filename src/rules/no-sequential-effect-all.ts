/** Use explicit sequencing when Effect.all discards a serial result. */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { expressionArgument, staticProperties } from "./_call-arguments.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";

type LiteralNode = Extract<ESTree.Expression, { readonly type: "Literal" }>;

const primitiveLiteral = (node: ESTree.Expression): Option.Option<LiteralNode> => {
  if (node.type !== "Literal") return Option.none();
  const value = node.value;
  if (
    Predicate.isNull(value) ||
    Predicate.isString(value) ||
    Predicate.isNumber(value) ||
    Predicate.isBoolean(value)
  ) {
    return Option.some(node);
  }
  return Option.none();
};

/** The first primitive literal given for `name` in an options object literal. */
const propertyLiteral = (node: ESTree.Expression, name: string): Option.Option<LiteralNode> => {
  if (node.type !== "ObjectExpression") return Option.none();
  return Arr.findFirst(staticProperties(node, name), (property) =>
    primitiveLiteral(property.value),
  );
};

/** Whether the options set `name` to the literal `expected`. */
const hasLiteralOption = (
  options: Option.Option<ESTree.Expression>,
  name: string,
  expected: boolean | number,
): boolean =>
  Option.exists(
    Option.flatMap(options, (node) => propertyLiteral(node, name)),
    (literal) => literal.value === expected,
  );

const pipedToAsVoid = (
  node: ESTree.CallExpression,
  effectNamespaces: ReadonlySet<string>,
): boolean => {
  const member = node.parent;
  if (
    member?.type !== "MemberExpression" ||
    member.object !== node ||
    member.computed ||
    member.property.type !== "Identifier" ||
    member.property.name !== "pipe"
  ) {
    return false;
  }
  const pipe = member.parent;
  if (pipe?.type !== "CallExpression") return false;
  for (const operation of pipe.arguments) {
    if (operation.type === "SpreadElement") continue;
    if (isStaticMember(operation, effectNamespaces, "asVoid")) return true;
  }
  return false;
};

export const noSequentialEffectAll = Rule.define({
  name: "no-sequential-effect-all",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Use explicit sequencing instead of a serial Effect.all whose result is discarded.",
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
        if (!isStaticMember(node.callee, namespaces, "all")) return Effect.void;
        if (node.arguments[0]?.type !== "ArrayExpression") return Effect.void;
        const options = expressionArgument(node, 1);
        if (!hasLiteralOption(options, "concurrency", 1)) return Effect.void;
        const discards =
          hasLiteralOption(options, "discard", true) || pipedToAsVoid(node, namespaces);
        if (!discards) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message:
              "Use Effect.andThen or one flat generator for sequential steps. Reserve Effect.all for value aggregation or real concurrency.",
          }),
        );
      },
    };
  },
});

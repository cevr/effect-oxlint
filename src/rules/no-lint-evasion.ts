/**
 * Ban the spellings of `undefined`, `null`, and `unknown` that exist only to
 * pass `effect/noNullish` and `effect/noUnknownParameters`.
 *
 * `Option.getOrUndefined(Option.none())` is `undefined`, and
 * `Schema.Schema.Type<typeof Schema.Unknown>` is `unknown`. Each hides the
 * value the evaded rule is about behind an Effect API and costs the reader a
 * double take. Where absence or an unknown value is honest, write it plainly
 * with one scoped suppression that gives its reason.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { importedNamespaces, isStaticCall, visibleNamespaces } from "./_effect-namespaces.js";

/** The dotted path of a type name or `typeof` operand: `Schema.Schema.Type` → three segments. */
const typeNamePath = (node: ESTree.Node): Option.Option<ReadonlyArray<string>> => {
  if (node.type === "Identifier") return Option.some([node.name]);
  if (node.type !== "TSQualifiedName") return Option.none();
  return Option.map(typeNamePath(node.left), (left) => [...left, node.right.name]);
};

/** Whether `path` is `<namespace>.<...members>` for one of the Schema namespaces. */
const isSchemaPath = (
  path: Option.Option<ReadonlyArray<string>>,
  namespaces: ReadonlySet<string>,
  members: ReadonlyArray<string>,
): boolean =>
  Option.exists(
    path,
    ([namespace = "", ...rest]) =>
      namespaces.has(namespace) &&
      rest.length === members.length &&
      rest.every((member, index) => member === members[index]),
  );

const nullishGetters = new Map([
  ["getOrUndefined", "undefined` spelled to pass `effect/noNullish"],
  ["getOrNull", "null` spelled to pass `effect/noNullish"],
]);

export const noLintEvasion = Rule.define({
  name: "no-lint-evasion",
  meta: Rule.meta({
    type: "problem",
    description:
      "Ban Option.getOrUndefined(Option.none()) and Schema.Schema.Type<typeof Schema.Unknown>, spelled only to pass noNullish and noUnknownParameters.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const optionNamespaces = new Set(["Option"]);
    const schemaNamespaces = new Set(["Schema"]);

    const report = (node: ESTree.Node, message: string) =>
      ctx.report(Diagnostic.make({ node, message }));

    const unknownSpelling = (node: ESTree.TSTypeReference | ESTree.TSTypeQuery) => {
      const schemas = visibleNamespaces(ctx, node, schemaNamespaces);
      if (node.type === "TSTypeQuery") {
        return isSchemaPath(typeNamePath(node.exprName), schemas, ["Unknown", "Type"]);
      }
      if (!isSchemaPath(typeNamePath(node.typeName), schemas, ["Schema", "Type"])) return false;
      const [argument] = node.typeArguments?.params ?? [];
      return (
        argument?.type === "TSTypeQuery" &&
        isSchemaPath(typeNamePath(argument.exprName), schemas, ["Unknown"])
      );
    };

    const reportUnknown = (node: ESTree.TSTypeReference | ESTree.TSTypeQuery) => {
      if (!unknownSpelling(node)) return Effect.void;
      return report(
        node,
        "This is `unknown` spelled to pass `effect/noUnknownParameters`. Write `unknown` with a scoped suppression and its reason, or name the type the value has.",
      );
    };

    return {
      ImportDeclaration: (node: ESTree.ImportDeclaration) => {
        for (const name of importedNamespaces(node, "Option", "effect/Option")) {
          optionNamespaces.add(name);
        }
        for (const name of importedNamespaces(node, "Schema", "effect/Schema")) {
          schemaNamespaces.add(name);
        }
        return Effect.void;
      },
      CallExpression: (node: ESTree.CallExpression) => {
        const options = visibleNamespaces(ctx, node, optionNamespaces);
        const [argument] = node.arguments;
        if (argument?.type !== "CallExpression" || !isStaticCall(argument, options, "none")) {
          return Effect.void;
        }
        for (const [getter, spelled] of nullishGetters) {
          if (isStaticCall(node, options, getter)) {
            return report(
              node,
              `\`Option.${getter}(Option.none())\` is \`${spelled}\`. Write the value with a scoped suppression and its reason, or model the absence as an Option.`,
            );
          }
        }
        return Effect.void;
      },
      TSTypeReference: reportUnknown,
      TSTypeQuery: reportUnknown,
    };
  },
});

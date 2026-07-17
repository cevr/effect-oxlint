/**
 * Ban predicates that promote unknown data without a Schema decode boundary.
 * Nominal `instanceof` guards remain valid because they check runtime identity.
 *
 * Source: biome-effect-linting-rules/no-manual-data-guard
 */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";

interface AstNode {
  readonly type: string;
  readonly parent?: unknown;
  readonly [key: string]: unknown;
}

const isAstNode = (value: unknown): value is AstNode =>
  typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";

const functionTypes = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
]);

const findFunction = (node: AstNode): AstNode | undefined => {
  let parent = node.parent;
  while (isAstNode(parent)) {
    if (functionTypes.has(parent.type)) return parent;
    parent = parent.parent;
  }
  return undefined;
};

const containsNodeType = (value: unknown, nodeTypes: ReadonlySet<string>): boolean => {
  if (Array.isArray(value)) return value.some((item) => containsNodeType(item, nodeTypes));
  if (!isAstNode(value)) return false;
  if (nodeTypes.has(value.type)) return true;
  return Object.entries(value).some(
    ([key, child]) => key !== "parent" && containsNodeType(child, nodeTypes),
  );
};

const containsInstanceOf = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(containsInstanceOf);
  if (!isAstNode(value)) return false;
  if (value.type === "BinaryExpression" && value["operator"] === "instanceof") return true;
  return Object.entries(value).some(
    ([key, child]) => key !== "parent" && containsInstanceOf(child),
  );
};

const parameterName = (parameter: unknown): string | undefined => {
  if (!isAstNode(parameter)) return undefined;
  if (
    (parameter.type === "Identifier" || parameter.type === "BindingIdentifier") &&
    typeof parameter["name"] === "string"
  ) {
    return parameter["name"];
  }
  return undefined;
};

export const noManualDataGuard = Rule.define({
  name: "no-manual-data-guard",
  meta: Rule.meta({
    type: "suggestion",
    description: "Decode unknown data with Schema instead of asserting it with a type predicate.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    return {
      TSTypePredicate: (node: ESTree.TSTypePredicate) => {
        const predicate = node as unknown as AstNode;
        const fn = findFunction(predicate);
        if (fn === undefined || containsInstanceOf(fn["body"])) {
          return Effect.void;
        }

        const predicateParameter = parameterName(node.parameterName);
        const parameters = Array.isArray(fn["params"]) ? fn["params"] : [];
        const promotesUnknown = parameters.some(
          (parameter) =>
            parameterName(parameter) === predicateParameter &&
            containsNodeType(parameter, new Set(["TSUnknownKeyword", "TSAnyKeyword"])),
        );
        return promotesUnknown
          ? ctx.report(
              Diagnostic.make({
                node,
                message:
                  "Avoid promoting unknown data with a manual type predicate. Decode it with the canonical Schema first.",
              }),
            )
          : Effect.void;
      },
    };
  },
});

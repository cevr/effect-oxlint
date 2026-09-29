/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import {
  createTypeAliasEnvironment,
  resolvedTypeMatches,
  type TypeAliasEnvironment,
} from "./_anti-slop-type-alias-resolution.js";

type FunctionWithReturnType =
  | ESTree.ArrowFunctionExpression
  | ESTree.Function
  | ESTree.TSCallSignatureDeclaration
  | ESTree.TSConstructSignatureDeclaration
  | ESTree.TSConstructorType
  | ESTree.TSFunctionType
  | ESTree.TSMethodSignature;

/**
 * Whether the node sits in a type pattern rather than a contract: the `extends`
 * clause of a conditional type or a type parameter constraint. There
 * `(...args: never[]) => unknown` matches any function; it promises nothing.
 * (Local change: upstream reports these.)
 */
function isInsideTypePattern(node: ESTree.Node): boolean {
  let child: ESTree.Node = node;
  let parent: ESTree.Node | null = node.parent;
  while (parent !== null && parent.type !== "Program") {
    if (parent.type === "TSConditionalType" && parent.extendsType === child) return true;
    if (parent.type === "TSTypeParameter" && parent.constraint === child) return true;
    child = parent;
    parent = parent.parent;
  }
  return false;
}

/** Ban function contracts that return unknown instead of a parsed domain type. */
export const noUnknownReturns = Rule.define({
  name: "no-unknown-returns",
  meta: Rule.meta({
    type: "problem",
    description:
      "Disallow functions whose explicit return contract is unknown or Promise<unknown>.",
    messages: {
      unknownReturn:
        "This function exposes `unknown` to its caller. Parse the value at its boundary and return a named domain type.",
    },
  }),
  create: function* () {
    const context = yield* RuleContext;
    let environment: TypeAliasEnvironment | null = null;

    const resolvesToUnknown = (type: ESTree.TSType): boolean =>
      environment !== null &&
      resolvedTypeMatches(type, environment, (resolved, matches) => {
        if (resolved.type === "TSUnknownKeyword") return true;
        if (resolved.type === "TSParenthesizedType") return matches(resolved.typeAnnotation);
        if (resolved.type === "TSUnionType") return resolved.types.some(matches);
        if (
          resolved.type !== "TSTypeReference" ||
          resolved.typeName.type !== "Identifier" ||
          (resolved.typeName.name !== "Promise" && resolved.typeName.name !== "PromiseLike")
        ) {
          return false;
        }
        const value = resolved.typeArguments?.params[0];
        return value !== undefined && matches(value);
      });

    const checkReturnType = (node: FunctionWithReturnType) => {
      const annotation = node.returnType;
      if (annotation === null || annotation === undefined) return Effect.void;
      if (!resolvesToUnknown(annotation.typeAnnotation)) return Effect.void;
      if (isInsideTypePattern(node)) return Effect.void;
      return context.report(
        Diagnostic.fromId({ node: annotation.typeAnnotation, messageId: "unknownReturn" }),
      );
    };

    return {
      Program: (node: ESTree.Program) => {
        environment = createTypeAliasEnvironment(node, context.sourceCode.visitorKeys);
        return Effect.void;
      },
      ArrowFunctionExpression: checkReturnType,
      FunctionDeclaration: checkReturnType,
      FunctionExpression: checkReturnType,
      TSCallSignatureDeclaration: checkReturnType,
      TSConstructSignatureDeclaration: checkReturnType,
      TSConstructorType: checkReturnType,
      TSDeclareFunction: checkReturnType,
      TSEmptyBodyFunctionExpression: checkReturnType,
      TSFunctionType: checkReturnType,
      TSMethodSignature: checkReturnType,
    };
  },
});

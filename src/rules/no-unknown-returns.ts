/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import {
  createTypeAliasEnvironment,
  resolvedTypeMatches,
  type TypeAliasEnvironment,
} from "./_anti-slop-type-alias-resolution.js";
import { ancestors } from "./_ast-ancestors.js";

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
// Local change: walks ancestors() instead of a nullable parent loop.
function isInsideTypePattern(node: ESTree.Node): boolean {
  let child: ESTree.Node = node;
  for (const parent of ancestors(node)) {
    if (parent.type === "TSConditionalType" && parent.extendsType === child) return true;
    if (parent.type === "TSTypeParameter" && parent.constraint === child) return true;
    child = parent;
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
    // Local change: the environment is an Option until Program sets it.
    let environment: Option.Option<TypeAliasEnvironment> = Option.none();

    const resolvesToUnknown = (type: ESTree.TSType): boolean =>
      Option.exists(environment, (present) =>
        resolvedTypeMatches(type, present, (resolved, matches) => {
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
          return Option.exists(Arr.head(resolved.typeArguments?.params ?? []), matches);
        }),
      );

    const checkReturnType = (node: FunctionWithReturnType) => {
      const annotation = node.returnType;
      if (Predicate.isNullish(annotation)) return Effect.void;
      if (!resolvesToUnknown(annotation.typeAnnotation)) return Effect.void;
      if (isInsideTypePattern(node)) return Effect.void;
      return context.report(
        Diagnostic.fromId({ node: annotation.typeAnnotation, messageId: "unknownReturn" }),
      );
    };

    return {
      Program: (node: ESTree.Program) => {
        environment = Option.some(createTypeAliasEnvironment(node, context.sourceCode.visitorKeys));
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

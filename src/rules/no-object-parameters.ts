/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import {
  functionParameterBindingName,
  functionParameterTypeAnnotation,
} from "./_anti-slop-function-parameters.js";
import {
  createTypeAliasEnvironment,
  resolvedTypeMatches,
  type TypeAliasEnvironment,
} from "./_anti-slop-type-alias-resolution.js";

type ParameterOwner =
  | ESTree.ArrowFunctionExpression
  | ESTree.Function
  | ESTree.TSCallSignatureDeclaration
  | ESTree.TSConstructSignatureDeclaration
  | ESTree.TSConstructorType
  | ESTree.TSFunctionType
  | ESTree.TSMethodSignature;

/** Ban the broad object type on function inputs, including local aliases to object. */
export const noObjectParameters = Rule.define({
  name: "no-object-parameters",
  meta: Rule.meta({
    type: "problem",
    description:
      "Disallow object function parameters; inputs must use an owner-provided type and be parsed at their boundary.",
    messages: {
      objectParameter:
        "Parameter `{{parameter}}` accepts the broad `object` type. Use the expected owner type or decode the external input at its boundary.",
    },
  }),
  create: function* () {
    const context = yield* RuleContext;
    let environment: TypeAliasEnvironment | null = null;

    const resolvesToObject = (type: ESTree.TSType): boolean =>
      environment !== null &&
      resolvedTypeMatches(type, environment, (resolved, matches) => {
        if (resolved.type === "TSObjectKeyword") return true;
        if (resolved.type === "TSParenthesizedType") return matches(resolved.typeAnnotation);
        return resolved.type === "TSUnionType" && resolved.types.some(matches);
      });

    const checkParameters = (node: ParameterOwner) =>
      Effect.forEach(
        node.params,
        (parameter) => {
          const annotation = functionParameterTypeAnnotation(parameter);
          if (annotation === null || annotation === undefined) return Effect.void;
          if (!resolvesToObject(annotation.typeAnnotation)) return Effect.void;
          return context.report(
            Diagnostic.fromId({
              node: annotation.typeAnnotation,
              messageId: "objectParameter",
              data: { parameter: functionParameterBindingName(parameter, context.sourceCode) },
            }),
          );
        },
        { discard: true },
      );

    return {
      Program: (node: ESTree.Program) => {
        environment = createTypeAliasEnvironment(node, context.sourceCode.visitorKeys);
        return Effect.void;
      },
      ArrowFunctionExpression: checkParameters,
      FunctionDeclaration: checkParameters,
      FunctionExpression: checkParameters,
      TSCallSignatureDeclaration: checkParameters,
      TSConstructSignatureDeclaration: checkParameters,
      TSConstructorType: checkParameters,
      TSDeclareFunction: checkParameters,
      TSEmptyBodyFunctionExpression: checkParameters,
      TSFunctionType: checkParameters,
      TSMethodSignature: checkParameters,
    };
  },
});

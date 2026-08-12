/**
 * Ported from dmmulroy/anti-slop at
 * b5d2288db1f00469a1d5f2e3b0e265e5a5676fd0.
 */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";

type Parameter = ESTree.ParamPattern;
type ParameterOwner =
  | ESTree.ArrowFunctionExpression
  | ESTree.Function
  | ESTree.TSCallSignatureDeclaration
  | ESTree.TSConstructSignatureDeclaration
  | ESTree.TSConstructorType
  | ESTree.TSFunctionType
  | ESTree.TSMethodSignature;

function parameterAnnotation(parameter: Parameter): ESTree.TSTypeAnnotation | null | undefined {
  if (parameter.type === "TSParameterProperty") return parameterAnnotation(parameter.parameter);
  if (parameter.type === "RestElement") {
    return parameter.typeAnnotation ?? parameterAnnotation(parameter.argument);
  }
  if (parameter.type === "AssignmentPattern") {
    return parameter.typeAnnotation ?? parameter.left.typeAnnotation;
  }
  return parameter.typeAnnotation;
}

function parameterName(parameter: Parameter, sourceText: string): string {
  if (parameter.type === "TSParameterProperty") {
    return parameterName(parameter.parameter, sourceText);
  }
  if (parameter.type === "AssignmentPattern") return parameterName(parameter.left, sourceText);
  if (parameter.type === "RestElement") return parameterName(parameter.argument, sourceText);
  return parameter.type === "Identifier"
    ? parameter.name
    : sourceText.replace(/\s*:\s*unknown\s*$/u, "");
}

/** Disallow unknown inputs except explicitly named error-cause enrichment. */
export const noUnknownParameters = Rule.define({
  name: "no-unknown-parameters",
  meta: Rule.meta({
    type: "problem",
    description:
      "Disallow explicitly unknown function parameters except `cause`; decode unknown input at its I/O boundary instead.",
    messages: {
      unknownParameter:
        "Parameter `{{parameter}}` accepts `unknown` without establishing its contract. Define the expected schema or parser so the value becomes a strongly typed domain type at the earliest possible point, as close as possible to the I/O boundary where the data originated.",
    },
  }),
  create: function* () {
    const context = yield* RuleContext;
    const checkParameters = (node: ParameterOwner) =>
      Effect.forEach(
        node.params,
        (parameter) => {
          const annotation = parameterAnnotation(parameter);
          if (annotation?.typeAnnotation.type !== "TSUnknownKeyword") return Effect.void;
          const name = parameterName(parameter, context.sourceCode.getText(parameter));
          if (name === "cause") return Effect.void;
          return context.report(
            Diagnostic.fromId({
              node: annotation.typeAnnotation,
              messageId: "unknownParameter",
              data: { parameter: name },
            }),
          );
        },
        { discard: true },
      );
    return {
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

/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b. The rejection-handler exemption
 * comes from the vendored copy in joelhooks/rat-stack.
 */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import {
  containsUnknownType,
  functionParameterBindingName,
  functionParameterTypeAnnotation,
} from "./_anti-slop-function-parameters.js";

type ParameterOwner =
  | ESTree.ArrowFunctionExpression
  | ESTree.Function
  | ESTree.TSCallSignatureDeclaration
  | ESTree.TSConstructSignatureDeclaration
  | ESTree.TSConstructorType
  | ESTree.TSFunctionType
  | ESTree.TSMethodSignature;

function isTypePredicateSubject(owner: ParameterOwner, parameterName: string): boolean {
  const predicate = owner.returnType?.typeAnnotation;
  return (
    predicate?.type === "TSTypePredicate" &&
    predicate.parameterName.type === "Identifier" &&
    predicate.parameterName.name === parameterName
  );
}

/**
 * Whether the function is a promise rejection handler: the argument to `.catch`
 * or the second argument to `.then`. Its first parameter is the function form of
 * a `catch` clause binding and receives `unknown` by nature.
 */
function isRejectionHandler(owner: ParameterOwner): boolean {
  if (owner.type !== "ArrowFunctionExpression" && owner.type !== "FunctionExpression") {
    return false;
  }
  const call = owner.parent;
  if (
    call?.type !== "CallExpression" ||
    call.callee.type !== "MemberExpression" ||
    call.callee.computed ||
    call.callee.property.type !== "Identifier"
  ) {
    return false;
  }
  const position = call.arguments.indexOf(owner);
  const method = call.callee.property.name;
  return (method === "catch" && position === 0) || (method === "then" && position === 1);
}

/** Disallow unknown inputs except error-cause enrichment, type guards, and rejection handlers. */
export const noUnknownParameters = Rule.define({
  name: "no-unknown-parameters",
  meta: Rule.meta({
    type: "problem",
    description:
      "Disallow explicitly unknown function parameters except `cause`, type-predicate subjects, and the reason a promise rejection handler receives; decode unknown input at its I/O boundary instead.",
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
          const annotation = functionParameterTypeAnnotation(parameter);
          if (annotation === null || annotation === undefined) return Effect.void;
          if (!containsUnknownType(annotation.typeAnnotation)) return Effect.void;
          const name = functionParameterBindingName(parameter, context.sourceCode);
          if (
            name === "cause" ||
            isTypePredicateSubject(node, name) ||
            (parameter === node.params[0] && isRejectionHandler(node))
          ) {
            return Effect.void;
          }
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

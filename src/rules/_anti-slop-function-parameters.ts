/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import type { ESTree, SourceCode } from "@oxlint/plugins";
import * as Option from "effect/Option";

export type FunctionParameter = ESTree.ParamPattern;

/** Return whether a type is or contains TypeScript's absorbing unknown top type. */
export function containsUnknownType(type: ESTree.TSType): boolean {
  if (type.type === "TSUnknownKeyword") return true;
  if (type.type === "TSParenthesizedType") return containsUnknownType(type.typeAnnotation);
  return type.type === "TSUnionType" && type.types.some(containsUnknownType);
}

/** Return the TypeScript annotation attached to a function parameter or its wrapped binding. */
// Local change: returns Option instead of a nullable annotation.
export function functionParameterTypeAnnotation(
  parameter: FunctionParameter,
): Option.Option<ESTree.TSTypeAnnotation> {
  if (parameter.type === "TSParameterProperty") {
    return functionParameterTypeAnnotation(parameter.parameter);
  }
  if (parameter.type === "RestElement") {
    return Option.orElse(Option.fromNullishOr(parameter.typeAnnotation), () =>
      functionParameterTypeAnnotation(parameter.argument),
    );
  }
  if (parameter.type === "AssignmentPattern") {
    return Option.orElse(Option.fromNullishOr(parameter.typeAnnotation), () =>
      functionParameterTypeAnnotation(parameter.left),
    );
  }
  return Option.fromNullishOr(parameter.typeAnnotation);
}

/** Return only a function parameter's local binding, excluding its annotation and default value. */
// Local change: the annotation offset is an Option instead of undefined.
export function functionParameterBindingName(
  parameter: FunctionParameter,
  sourceCode: SourceCode,
): string {
  if (parameter.type === "TSParameterProperty") {
    return functionParameterBindingName(parameter.parameter, sourceCode);
  }
  if (parameter.type === "AssignmentPattern") {
    return functionParameterBindingName(parameter.left, sourceCode);
  }
  if (parameter.type === "RestElement") {
    return functionParameterBindingName(parameter.argument, sourceCode);
  }
  // Read the annotation before narrowing: the ESTree types declare binding annotations as
  // null and intersect patterns to `never`, although TypeScript sources carry annotations.
  const annotationOffset = Option.map(
    functionParameterTypeAnnotation(parameter),
    (annotation) => annotation.start - parameter.start,
  );
  if (parameter.type === "Identifier") return parameter.name;
  const sourceText = sourceCode.getText(parameter);
  return Option.match(annotationOffset, {
    onNone: () => sourceText,
    onSome: (offset) => sourceText.slice(0, offset).trimEnd(),
  });
}

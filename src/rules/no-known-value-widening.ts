/**
 * Ported from dmmulroy/anti-slop at
 * b5d2288db1f00469a1d5f2e3b0e265e5a5676fd0.
 */
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import {
  classifyWideningTarget,
  createTypeEnvironment,
  isKnownEvidenceExpression,
  type TypeEnvironment,
  type WideningTarget,
} from "./_anti-slop-dictionary-types.js";

import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins";

type FunctionExpression = ESTree.ArrowFunctionExpression | ESTree.Function;

function unwrapExpression(expression: ESTree.Expression): ESTree.Expression {
  let current = expression;
  while (
    current.type === "ParenthesizedExpression" ||
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSTypeAssertion" ||
    current.type === "TSNonNullExpression"
  ) {
    current = current.expression;
  }
  return current;
}

function resolveVariable(
  sourceCode: SourceCode,
  identifier: ESTree.IdentifierReference,
): Variable | null {
  let scope: Scope | null = sourceCode.getScope(identifier);
  while (scope !== null) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) return variable;
    scope = scope.upper;
  }
  return null;
}

function variableDeclarator(variable: Variable): ESTree.VariableDeclarator | null {
  if (variable.defs.length !== 1) return null;
  const [definition] = variable.defs;
  return definition?.type === "Variable" && definition.node.type === "VariableDeclarator"
    ? definition.node
    : null;
}

function isStableConstVariable(variable: Variable, declarator: ESTree.VariableDeclarator): boolean {
  return (
    declarator.parent.type === "VariableDeclaration" &&
    declarator.parent.kind === "const" &&
    variable.references.every((reference) => reference.init || !reference.isWrite())
  );
}

function hasKnownEvidence(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  visitedVariables = new Set<Variable>(),
): boolean {
  if (isKnownEvidenceExpression(expression)) return true;
  const unwrapped = unwrapExpression(expression);
  if (unwrapped.type !== "Identifier") return false;
  const variable = resolveVariable(sourceCode, unwrapped);
  if (variable === null || visitedVariables.has(variable)) return false;
  const declarator = variableDeclarator(variable);
  if (
    declarator === null ||
    declarator.init === null ||
    !isStableConstVariable(variable, declarator)
  ) {
    return false;
  }
  visitedVariables.add(variable);
  return hasKnownEvidence(sourceCode, declarator.init, visitedVariables);
}

function annotationTarget(
  annotation: ESTree.TSTypeAnnotation | null | undefined,
  environment: TypeEnvironment,
): WideningTarget | null {
  return annotation === null || annotation === undefined
    ? null
    : classifyWideningTarget(annotation.typeAnnotation, environment);
}

function enclosingFunction(node: ESTree.Node): FunctionExpression | null {
  let current: ESTree.Node | null = node.parent;
  while (current !== null && current.type !== "Program") {
    if (
      current.type === "ArrowFunctionExpression" ||
      current.type === "FunctionDeclaration" ||
      current.type === "FunctionExpression"
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function sourceKeyName(sourceCode: SourceCode, key: ESTree.PropertyKey): string {
  if (key.type === "Identifier" || key.type === "PrivateIdentifier") return key.name;
  if (key.type === "Literal") return String(key.value);
  return sourceCode.getText(key);
}

function functionName(sourceCode: SourceCode, owner: FunctionExpression | null): string {
  if (owner === null) return "anonymous function";
  if (owner.id !== null) return owner.id.name;
  const parent = owner.parent;
  if (parent.type === "VariableDeclarator" && parent.id.type === "Identifier")
    return parent.id.name;
  if (parent.type === "MethodDefinition") return sourceKeyName(sourceCode, parent.key);
  return "anonymous function";
}

function isEmptyObjectExpression(expression: ESTree.Expression): boolean {
  const unwrapped = unwrapExpression(expression);
  return unwrapped.type === "ObjectExpression" && unwrapped.properties.length === 0;
}

function isDictionaryAccumulatorTarget(destination: WideningTarget): boolean {
  return destination.kind === "open dictionary" || destination.kind === "generic container";
}

function hasParentAssertion(node: ESTree.Node): boolean {
  return node.parent?.type === "TSAsExpression" || node.parent?.type === "TSTypeAssertion";
}

/** Detect sound syntactic cases where a known value is explicitly widened and loses evidence. */
export const noKnownValueWidening = Rule.define({
  name: "no-known-value-widening",
  meta: Rule.meta({
    type: "problem",
    description:
      "Disallow syntactically established values from flowing into explicitly broad or anonymous target types that discard useful evidence.",
    messages: {
      widening:
        "The known initializer supplying {{subject}} carries established type evidence, but the explicit {{target}} target type discards it. Preserve inference, use `satisfies`, or introduce/use a named owner contract; parse genuinely external data once at its boundary.",
    },
  }),
  create: function* () {
    const context = yield* RuleContext;
    let environment: TypeEnvironment | null = null;

    const reportFlow = (
      expression: ESTree.Expression,
      destination: WideningTarget | null,
      subject: string,
      options: Readonly<{ allowEmptyDictionaryAccumulator?: boolean }> = {},
    ) => {
      if (destination === null) return Effect.void;
      if (
        options.allowEmptyDictionaryAccumulator === true &&
        isDictionaryAccumulatorTarget(destination) &&
        isEmptyObjectExpression(expression)
      ) {
        return Effect.void;
      }
      if (!hasKnownEvidence(context.sourceCode, expression)) return Effect.void;
      return context.report(
        Diagnostic.fromId({
          node: expression,
          messageId: "widening",
          data: { subject, target: destination.kind },
        }),
      );
    };

    const targetFromAnnotation = (annotation: ESTree.TSTypeAnnotation | null | undefined) =>
      environment === null ? null : annotationTarget(annotation, environment);

    return {
      Program: (node: ESTree.Program) => {
        environment = createTypeEnvironment(node);
        return Effect.void;
      },
      VariableDeclarator: (node: ESTree.VariableDeclarator) => {
        if (node.init === null || node.id.type !== "Identifier") return Effect.void;
        return reportFlow(
          node.init,
          targetFromAnnotation(node.id.typeAnnotation),
          `binding \`${node.id.name}\``,
          { allowEmptyDictionaryAccumulator: true },
        );
      },
      PropertyDefinition: (node: ESTree.PropertyDefinition) => {
        if (node.value === null) return Effect.void;
        return reportFlow(
          node.value,
          targetFromAnnotation(node.typeAnnotation),
          `property \`${sourceKeyName(context.sourceCode, node.key)}\``,
        );
      },
      AccessorProperty: (node: ESTree.AccessorProperty) => {
        if (node.value === null) return Effect.void;
        return reportFlow(
          node.value,
          targetFromAnnotation(node.typeAnnotation),
          `property \`${sourceKeyName(context.sourceCode, node.key)}\``,
        );
      },
      AssignmentExpression: (node: ESTree.AssignmentExpression) => {
        if (node.operator !== "=" || node.left.type !== "Identifier") return Effect.void;
        const variable = resolveVariable(context.sourceCode, node.left);
        if (variable === null) return Effect.void;
        const declarator = variableDeclarator(variable);
        if (declarator === null || declarator.id.type !== "Identifier") return Effect.void;
        return reportFlow(
          node.right,
          targetFromAnnotation(declarator.id.typeAnnotation),
          `binding \`${declarator.id.name}\``,
        );
      },
      ReturnStatement: (node: ESTree.ReturnStatement) => {
        if (node.argument === null) return Effect.void;
        const owner = enclosingFunction(node);
        return reportFlow(
          node.argument,
          targetFromAnnotation(owner?.returnType),
          `return value of \`${functionName(context.sourceCode, owner)}\``,
        );
      },
      ArrowFunctionExpression: (node: ESTree.ArrowFunctionExpression) => {
        if (node.body.type === "BlockStatement") return Effect.void;
        return reportFlow(
          node.body,
          targetFromAnnotation(node.returnType),
          `return value of \`${functionName(context.sourceCode, node)}\``,
        );
      },
      TSAsExpression: (node: ESTree.TSAsExpression) =>
        environment === null || hasParentAssertion(node)
          ? Effect.void
          : reportFlow(
              node.expression,
              classifyWideningTarget(node.typeAnnotation, environment),
              "assertion",
            ),
      TSTypeAssertion: (node: ESTree.TSTypeAssertion) =>
        environment === null || hasParentAssertion(node)
          ? Effect.void
          : reportFlow(
              node.expression,
              classifyWideningTarget(node.typeAnnotation, environment),
              "assertion",
            ),
    };
  },
});

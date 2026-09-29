/**
 * Ported from dmmulroy/anti-slop at
 * c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b.
 */
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import {
  classifyWideningTarget,
  createTypeEnvironment,
  isKnownEvidenceExpression,
  type TypeEnvironment,
  type WideningTarget,
} from "./_anti-slop-dictionary-types.js";
import { resolveVariable } from "./_anti-slop-scope.js";
import { ancestors } from "./_ast-ancestors.js";

import type { ESTree, SourceCode, Variable } from "@oxlint/plugins";

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

// Local change: returns Option instead of null.
function variableDeclarator(variable: Variable): Option.Option<ESTree.VariableDeclarator> {
  if (variable.defs.length !== 1) return Option.none();
  return Option.flatMap(Arr.head(variable.defs), (definition) => {
    if (definition.type !== "Variable" || definition.node.type !== "VariableDeclarator") {
      return Option.none();
    }
    return Option.some(definition.node);
  });
}

function isStableConstVariable(variable: Variable, declarator: ESTree.VariableDeclarator): boolean {
  return (
    declarator.parent.type === "VariableDeclaration" &&
    declarator.parent.kind === "const" &&
    variable.references.every((reference) => reference.init || !reference.isWrite())
  );
}

/**
 * The initializer of a variable's single const declarator that is never reassigned.
 * (Local change: split from hasKnownEvidence to read the Option-returning helpers.)
 */
function stableConstInitializer(variable: Variable): Option.Option<ESTree.Expression> {
  return Option.flatMap(
    Option.filter(variableDeclarator(variable), (declarator) =>
      isStableConstVariable(variable, declarator),
    ),
    (declarator) => Option.fromNullishOr(declarator.init),
  );
}

// Local change: reads the Option-returning resolveVariable and stableConstInitializer.
function hasKnownEvidence(
  sourceCode: SourceCode,
  expression: ESTree.Expression,
  visitedVariables = new Set<Variable>(),
): boolean {
  if (isKnownEvidenceExpression(expression)) return true;
  const unwrapped = unwrapExpression(expression);
  if (unwrapped.type !== "Identifier") return false;
  const variable = resolveVariable(sourceCode, unwrapped);
  if (Option.isNone(variable) || visitedVariables.has(variable.value)) return false;
  const initializer = stableConstInitializer(variable.value);
  if (Option.isNone(initializer)) return false;
  visitedVariables.add(variable.value);
  return hasKnownEvidence(sourceCode, initializer.value, visitedVariables);
}

// Local change: takes the annotation and environment as Options instead of nullable values.
function annotationTarget(
  annotation: Option.Option<ESTree.TSTypeAnnotation>,
  environment: Option.Option<TypeEnvironment>,
): Option.Option<WideningTarget> {
  return Option.flatMap(Option.all({ annotation, environment }), (present) =>
    classifyWideningTarget(present.annotation.typeAnnotation, present.environment),
  );
}

function isFunctionExpression(node: ESTree.Node): node is FunctionExpression {
  return (
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression"
  );
}

// Local change: returns Option instead of null, searching ancestors().
function enclosingFunction(node: ESTree.Node): Option.Option<FunctionExpression> {
  return Arr.findFirst(ancestors(node), isFunctionExpression);
}

function sourceKeyName(sourceCode: SourceCode, key: ESTree.PropertyKey): string {
  if (key.type === "Identifier" || key.type === "PrivateIdentifier") return key.name;
  if (key.type === "Literal") return String(key.value);
  return sourceCode.getText(key);
}

// Local change: takes the owner as an Option instead of null.
function functionName(sourceCode: SourceCode, owner: Option.Option<FunctionExpression>): string {
  return Option.match(owner, {
    onNone: () => "anonymous function",
    onSome: (present) => ownerFunctionName(sourceCode, present),
  });
}

// Local change: split from functionName for the present owner.
function ownerFunctionName(sourceCode: SourceCode, owner: FunctionExpression): string {
  if (Predicate.isNotNull(owner.id)) return owner.id.name;
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
    // Local change: the environment is an Option until Program sets it.
    let environment: Option.Option<TypeEnvironment> = Option.none();

    const reportFlow = (
      expression: ESTree.Expression,
      destination: Option.Option<WideningTarget>,
      subject: string,
    ) => {
      if (Option.isNone(destination)) return Effect.void;
      const target = destination.value;
      if (isDictionaryAccumulatorTarget(target) && isEmptyObjectExpression(expression)) {
        return Effect.void;
      }
      if (!hasKnownEvidence(context.sourceCode, expression)) return Effect.void;
      return context.report(
        Diagnostic.fromId({
          node: expression,
          messageId: "widening",
          data: { subject, target: target.kind },
        }),
      );
    };

    // Local change: host annotations lift into Option at each call site.
    const targetFromAnnotation = (annotation: Option.Option<ESTree.TSTypeAnnotation>) =>
      annotationTarget(annotation, environment);

    // Local change: both assertion forms share one handler without ternaries.
    const reportAssertion = (node: ESTree.TSAsExpression | ESTree.TSTypeAssertion) => {
      if (hasParentAssertion(node)) return Effect.void;
      const target = Option.flatMap(environment, (present) =>
        classifyWideningTarget(node.typeAnnotation, present),
      );
      return reportFlow(node.expression, target, "assertion");
    };

    return {
      Program: (node: ESTree.Program) => {
        environment = Option.some(createTypeEnvironment(node, context.sourceCode.visitorKeys));
        return Effect.void;
      },
      VariableDeclarator: (node: ESTree.VariableDeclarator) => {
        if (Predicate.isNull(node.init) || node.id.type !== "Identifier") return Effect.void;
        return reportFlow(
          node.init,
          targetFromAnnotation(Option.fromNullishOr(node.id.typeAnnotation)),
          `binding \`${node.id.name}\``,
        );
      },
      PropertyDefinition: (node: ESTree.PropertyDefinition) => {
        if (Predicate.isNull(node.value)) return Effect.void;
        return reportFlow(
          node.value,
          targetFromAnnotation(Option.fromNullishOr(node.typeAnnotation)),
          `property \`${sourceKeyName(context.sourceCode, node.key)}\``,
        );
      },
      AccessorProperty: (node: ESTree.AccessorProperty) => {
        if (Predicate.isNull(node.value)) return Effect.void;
        return reportFlow(
          node.value,
          targetFromAnnotation(Option.fromNullishOr(node.typeAnnotation)),
          `property \`${sourceKeyName(context.sourceCode, node.key)}\``,
        );
      },
      AssignmentExpression: (node: ESTree.AssignmentExpression) => {
        if (node.operator !== "=" || node.left.type !== "Identifier") return Effect.void;
        const declarator = Option.flatMap(
          resolveVariable(context.sourceCode, node.left),
          variableDeclarator,
        );
        if (Option.isNone(declarator)) return Effect.void;
        const { id } = declarator.value;
        if (id.type !== "Identifier") return Effect.void;
        return reportFlow(
          node.right,
          targetFromAnnotation(Option.fromNullishOr(id.typeAnnotation)),
          `binding \`${id.name}\``,
        );
      },
      ReturnStatement: (node: ESTree.ReturnStatement) => {
        if (Predicate.isNull(node.argument)) return Effect.void;
        const owner = enclosingFunction(node);
        return reportFlow(
          node.argument,
          targetFromAnnotation(
            Option.flatMap(owner, (present) => Option.fromNullishOr(present.returnType)),
          ),
          `return value of \`${functionName(context.sourceCode, owner)}\``,
        );
      },
      ArrowFunctionExpression: (node: ESTree.ArrowFunctionExpression) => {
        if (node.body.type === "BlockStatement") return Effect.void;
        return reportFlow(
          node.body,
          targetFromAnnotation(Option.fromNullishOr(node.returnType)),
          `return value of \`${functionName(context.sourceCode, Option.some(node))}\``,
        );
      },
      TSAsExpression: reportAssertion,
      TSTypeAssertion: reportAssertion,
    };
  },
});

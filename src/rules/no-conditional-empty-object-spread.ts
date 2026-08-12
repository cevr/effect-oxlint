/**
 * Ported from dmmulroy/anti-slop at
 * b5d2288db1f00469a1d5f2e3b0e265e5a5676fd0.
 */
import type { ESTree, SourceCode } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";

type ConditionalEmptyObjectSpread = {
  readonly conditional: ESTree.ConditionalExpression;
  readonly property: ESTree.ObjectProperty | null;
};

type UndefinedCheckedExpression = {
  readonly expression: ESTree.Expression;
  readonly isDefinedWhenTrue: boolean;
};

function unwrapParentheses(node: ESTree.Expression): ESTree.Expression {
  let current = node;
  while (current.type === "ParenthesizedExpression") current = current.expression;
  return current;
}

function isEmptyObjectExpression(node: ESTree.Expression): boolean {
  return node.type === "ObjectExpression" && node.properties.length === 0;
}

function singleObjectProperty(node: ESTree.Expression): ESTree.ObjectProperty | null {
  if (node.type !== "ObjectExpression" || node.properties.length !== 1) return null;
  const [property] = node.properties;
  if (
    property?.type !== "Property" ||
    property.kind !== "init" ||
    property.method ||
    property.computed
  ) {
    return null;
  }
  return property;
}

function conditionalEmptyObjectSpread(
  node: ESTree.Expression,
): ConditionalEmptyObjectSpread | null {
  const conditional = unwrapParentheses(node);
  if (conditional.type !== "ConditionalExpression") return null;
  if (isEmptyObjectExpression(conditional.consequent)) {
    return { conditional, property: singleObjectProperty(conditional.alternate) };
  }
  if (isEmptyObjectExpression(conditional.alternate)) {
    return { conditional, property: singleObjectProperty(conditional.consequent) };
  }
  return null;
}

function undefinedCheckedExpression(test: ESTree.Expression): UndefinedCheckedExpression | null {
  const binary = unwrapParentheses(test);
  if (binary.type !== "BinaryExpression") return null;
  if (binary.operator !== "===" && binary.operator !== "!==") return null;
  const left = unwrapParentheses(binary.left);
  const right = unwrapParentheses(binary.right);
  const leftIsUndefined = left.type === "Identifier" && left.name === "undefined";
  const rightIsUndefined = right.type === "Identifier" && right.name === "undefined";
  if (leftIsUndefined === rightIsUndefined) return null;
  return {
    expression: leftIsUndefined ? right : left,
    isDefinedWhenTrue: binary.operator === "!==",
  };
}

function canAutofixConditionalEmptyObjectSpread(
  sourceCode: SourceCode,
  conditional: ESTree.ConditionalExpression,
  property: ESTree.ObjectProperty,
): boolean {
  const checked = undefinedCheckedExpression(conditional.test);
  if (checked === null) return false;
  const propertyIsConsequent = conditional.consequent === property.parent;
  if (propertyIsConsequent !== checked.isDefinedWhenTrue) return false;
  return (
    sourceCode.getText(unwrapParentheses(checked.expression)) === sourceCode.getText(property.value)
  );
}

/** Ban conditional empty-object spreads and autofix equivalent direct property declarations. */
export const noConditionalEmptyObjectSpread = Rule.define({
  name: "no-conditional-empty-object-spread",
  meta: Rule.meta({
    type: "suggestion",
    fixable: "code",
    description:
      "Disallow object spreads that conditionally spread an empty object to omit fields.",
    messages: {
      avoid:
        "Do not use conditional empty-object spreads. Prefer a direct property or build the object in separate statements.",
    },
  }),
  create: function* () {
    const context = yield* RuleContext;
    return {
      SpreadElement: (node: ESTree.SpreadElement) => {
        if (node.parent?.type !== "ObjectExpression") return Effect.void;
        const match = conditionalEmptyObjectSpread(node.argument);
        if (match === null) return Effect.void;
        const { conditional, property } = match;
        const diagnostic = Diagnostic.fromId({ node, messageId: "avoid" });
        if (
          property === null ||
          !canAutofixConditionalEmptyObjectSpread(context.sourceCode, conditional, property)
        ) {
          return context.report(diagnostic);
        }
        return context.report(
          Diagnostic.withFix(
            diagnostic,
            Diagnostic.replaceText(node, context.sourceCode.getText(property)),
          ),
        );
      },
    };
  },
});

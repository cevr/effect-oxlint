/**
 * Function-level structural metrics shared by the complexity rules.
 *
 * Every metric treats one function as one unit. A nested function is a
 * separate unit: the enclosing function does not absorb the nested body,
 * and the nested function is measured from a fresh nesting level.
 *
 * Type-level syntax never executes, so type annotations, type arguments,
 * and type-only declarations are excluded. TypeScript expression wrappers
 * such as `as`, `satisfies`, and `!` are transparent.
 *
 * Cognitive complexity follows the SonarSource specification
 * (G. Ann Campbell, "Cognitive Complexity", v1.5). Halstead counts follow
 * the escomplex convention: syntax that acts on values is an operator,
 * and every name or literal is an operand.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { childNodesAt, isAstNode } from "./_ast-children.js";

export type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

/**
 * Any ESTree node viewed structurally: a `type` tag and the scalar fields the
 * metrics read. Child slots are read with `childNodesAt`.
 */
interface AnyNode {
  readonly type: string;
  readonly operator?: unknown;
  readonly kind?: unknown;
  readonly name?: unknown;
  readonly value?: unknown;
  readonly raw?: unknown;
  readonly bigint?: unknown;
  readonly computed?: unknown;
  readonly optional?: unknown;
  readonly shorthand?: unknown;
  readonly method?: unknown;
  readonly delegate?: unknown;
  readonly async?: unknown;
  readonly generator?: unknown;
  readonly await?: unknown;
  readonly label?: unknown;
  readonly test?: unknown;
  readonly alternate?: unknown;
  readonly init?: unknown;
  readonly finalizer?: unknown;
  readonly superClass?: unknown;
  readonly meta?: unknown;
  readonly property?: unknown;
}

const isNode = (value: unknown): value is AnyNode => isAstNode(value);

const isFunctionType = (type: string): boolean =>
  type === "ArrowFunctionExpression" ||
  type === "FunctionDeclaration" ||
  type === "FunctionExpression";

export const isFunctionNode = (node: ESTree.Node): node is FunctionNode =>
  isFunctionType(node.type);

/** Slots that hold the parent link, source positions, or type-level syntax. */
const structuralKeys = new Set([
  "parent",
  "loc",
  "range",
  "start",
  "end",
  "typeAnnotation",
  "returnType",
  "typeParameters",
  "typeArguments",
  "superTypeArguments",
  "implements",
  "decorators",
]);

/** TypeScript expression wrappers whose `expression` slot is runtime code. */
const transparentTypeWrappers = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "TSInstantiationExpression",
]);

const isTypeOnly = (node: AnyNode): boolean =>
  node.type.startsWith("TS") && !transparentTypeWrappers.has(node.type);

const slot = (node: AnyNode, key: string): ReadonlyArray<AnyNode> =>
  childNodesAt(node, key, isNode);

/** Runtime child nodes of `node`, in source order of their slots. */
const children = (node: AnyNode): ReadonlyArray<AnyNode> => {
  if (transparentTypeWrappers.has(node.type)) return slot(node, "expression");
  const found: Array<AnyNode> = [];
  for (const key of Object.keys(node)) {
    if (structuralKeys.has(key)) continue;
    for (const child of slot(node, key)) {
      if (!isTypeOnly(child)) found.push(child);
    }
  }
  return found;
};

/** The nodes that form the body of a function unit: its parameters and its body. */
const unitRoots = (fn: FunctionNode): ReadonlyArray<AnyNode> => {
  return [...slot(fn, "params"), ...slot(fn, "body")];
};

// ---------------------------------------------------------------------------
// Cognitive complexity
// ---------------------------------------------------------------------------

/**
 * Flatten a logical expression tree into its operator sequence, left to right.
 * `a && b || c` yields `["&&", "||"]`.
 */
const logicalOperators = (node: AnyNode, into: Array<string>): void => {
  if (node.type !== "LogicalExpression") return;
  for (const side of slot(node, "left")) logicalOperators(side, into);
  into.push(String(node.operator));
  for (const side of slot(node, "right")) logicalOperators(side, into);
};

/** Leaf operands of a logical expression tree, in source order. */
const logicalLeaves = (node: AnyNode, into: Array<AnyNode>): void => {
  if (node.type !== "LogicalExpression") {
    into.push(node);
    return;
  }
  for (const side of slot(node, "left")) logicalLeaves(side, into);
  for (const side of slot(node, "right")) logicalLeaves(side, into);
};

/**
 * Cognitive complexity of one function, excluding nested functions.
 *
 * - `if`, loops, `switch`, `catch`, and `?:` cost one plus the current nesting level.
 * - `else` and `else if` cost one and never pay for nesting.
 * - A labelled `break` or `continue` costs one.
 * - Each run of like logical operators (`&&`, `||`, `??`) costs one.
 * - The bodies of nesting structures raise the nesting level by one.
 */
export const cognitiveComplexity = (fn: FunctionNode): number => {
  let total = 0;

  const visitSlot = (node: AnyNode, key: string, nesting: number): void => {
    for (const child of slot(node, key)) visit(child, nesting);
  };

  const visitIf = (node: AnyNode, nesting: number, isElseIf: boolean): void => {
    total += 1;
    if (!isElseIf) total += nesting;
    visitSlot(node, "test", nesting);
    visitSlot(node, "consequent", nesting + 1);
    for (const alternate of slot(node, "alternate")) {
      if (alternate.type === "IfStatement") {
        visitIf(alternate, nesting, true);
      } else {
        total += 1;
        visit(alternate, nesting + 1);
      }
    }
  };

  const visitNesting = (
    node: AnyNode,
    nesting: number,
    headerKeys: ReadonlyArray<string>,
    bodyKeys: ReadonlyArray<string>,
  ): void => {
    total += 1 + nesting;
    for (const key of headerKeys) visitSlot(node, key, nesting);
    for (const key of bodyKeys) visitSlot(node, key, nesting + 1);
  };

  const visit = (node: AnyNode, nesting: number): void => {
    if (isTypeOnly(node)) return;
    switch (node.type) {
      case "ArrowFunctionExpression":
      case "FunctionDeclaration":
      case "FunctionExpression":
        return;
      case "IfStatement":
        return visitIf(node, nesting, false);
      case "ConditionalExpression":
        return visitNesting(node, nesting, ["test"], ["consequent", "alternate"]);
      case "SwitchStatement":
        return visitNesting(node, nesting, ["discriminant"], ["cases"]);
      case "ForStatement":
        return visitNesting(node, nesting, ["init", "test", "update"], ["body"]);
      case "ForInStatement":
      case "ForOfStatement":
        return visitNesting(node, nesting, ["left", "right"], ["body"]);
      case "WhileStatement":
      case "DoWhileStatement":
        return visitNesting(node, nesting, ["test"], ["body"]);
      case "CatchClause":
        return visitNesting(node, nesting, ["param"], ["body"]);
      case "BreakStatement":
      case "ContinueStatement":
        if (isNode(node.label)) total += 1;
        return;
      case "LogicalExpression": {
        const operators: Array<string> = [];
        logicalOperators(node, operators);
        total += operators.filter((operator, index) => operator !== operators[index - 1]).length;
        const leaves: Array<AnyNode> = [];
        logicalLeaves(node, leaves);
        for (const leaf of leaves) visit(leaf, nesting);
        return;
      }
      default:
        for (const child of children(node)) visit(child, nesting);
    }
  };

  for (const root of unitRoots(fn)) visit(root, 0);
  return total;
};

// ---------------------------------------------------------------------------
// Halstead
// ---------------------------------------------------------------------------

export interface HalsteadCounts {
  /** η1: distinct operators. */
  readonly distinctOperators: number;
  /** N1: total operators. */
  readonly totalOperators: number;
  /** η2: distinct operands. */
  readonly distinctOperands: number;
  /** N2: total operands. */
  readonly totalOperands: number;
}

/** Halstead difficulty: `(η1 / 2) × (N2 / η2)`. Zero when the unit has no operands. */
export const halsteadDifficulty = (counts: HalsteadCounts): number => {
  if (counts.distinctOperands === 0) return 0;
  return (counts.distinctOperators / 2) * (counts.totalOperands / counts.distinctOperands);
};

const functionOperator = (node: AnyNode): string => {
  if (node.type === "ArrowFunctionExpression") return "=>";
  if (node.generator === true) return "function*";
  return "function";
};

const literalOperand = (node: AnyNode): string => {
  if (Predicate.isString(node.raw)) return node.raw;
  if (Predicate.isString(node.bigint)) return `${node.bigint}n`;
  return String(node.value);
};

const isNonEmpty = (text: string): boolean => text.length > 0;

const templateOperand = (node: AnyNode): Option.Option<string> => {
  const value = node.value;
  if (!Predicate.hasProperty(value, "raw") || !Predicate.isString(value.raw)) {
    return Option.none();
  }
  return Option.liftPredicate(value.raw, isNonEmpty);
};

/** `tokens` when `present`, otherwise none: the operator tokens of an optional clause. */
const tokensIf = (present: boolean, ...tokens: ReadonlyArray<string>): ReadonlyArray<string> => {
  if (!present) return [];
  return tokens;
};

/** The `name` of the node held in a slot, or empty when the slot holds none. */
const slotName = (node: AnyNode, key: string): string =>
  Option.match(Arr.head(slot(node, key)), {
    onNone: () => "",
    onSome: (child) => String(child.name),
  });

/** Node types that always stand for the same operator tokens. */
const fixedOperators = new Map<string, ReadonlyArray<string>>([
  ["ForStatement", ["for"]],
  ["ForInStatement", ["for-in"]],
  ["WhileStatement", ["while"]],
  ["DoWhileStatement", ["do-while"]],
  ["SwitchStatement", ["switch"]],
  ["ReturnStatement", ["return"]],
  ["ThrowStatement", ["throw"]],
  ["CatchClause", ["catch"]],
  ["BreakStatement", ["break"]],
  ["ContinueStatement", ["continue"]],
  ["LabeledStatement", [":"]],
  ["DebuggerStatement", ["debugger"]],
  ["WithStatement", ["with"]],
  ["AssignmentPattern", ["="]],
  ["NewExpression", ["new"]],
  ["ArrayExpression", ["[]"]],
  ["ArrayPattern", ["[]"]],
  ["ObjectExpression", ["{}"]],
  ["ObjectPattern", ["{}"]],
  ["SpreadElement", ["..."]],
  ["RestElement", ["..."]],
  ["ConditionalExpression", ["?:"]],
  ["SequenceExpression", [","]],
  ["AwaitExpression", ["await"]],
  ["ImportExpression", ["import()"]],
  ["TemplateLiteral", ["`"]],
  ["JSXElement", ["<>"]],
  ["JSXFragment", ["<>"]],
]);

/** Node types whose operator token carries the operator itself. */
const operatorCarriers = new Set([
  "BinaryExpression",
  "LogicalExpression",
  "AssignmentExpression",
  "UnaryExpression",
  "UpdateExpression",
]);

/** Statement-level nodes whose operator tokens depend on the node's shape. */
const statementOperators = (node: AnyNode): ReadonlyArray<string> => {
  switch (node.type) {
    case "IfStatement":
      return ["if", ...tokensIf(isNode(node.alternate), "else")];
    case "ForOfStatement":
      if (node.await === true) return ["for-await-of"];
      return ["for-of"];
    case "SwitchCase":
      if (isNode(node.test)) return ["case"];
      return ["default"];
    case "TryStatement":
      return ["try", ...tokensIf(isNode(node.finalizer), "finally")];
    case "VariableDeclaration":
      return [String(node.kind)];
    case "VariableDeclarator":
      return tokensIf(isNode(node.init), "=");
    case "ClassDeclaration":
    case "ClassExpression":
      return ["class", ...tokensIf(isNode(node.superClass), "extends")];
    case "PropertyDefinition":
      return tokensIf(isNode(node.value), "=");
    default:
      return [];
  }
};

/** `?.` calls and accesses carry a leading `?`. */
const optionalMark = (node: AnyNode): string => {
  if (node.optional === true) return "?";
  return "";
};

const memberAccess = (node: AnyNode): string => {
  if (node.computed === true) return "[]";
  return ".";
};

/** Expression-level nodes whose operator tokens depend on the node's shape. */
const expressionOperators = (node: AnyNode): ReadonlyArray<string> => {
  if (operatorCarriers.has(node.type)) return [String(node.operator)];
  switch (node.type) {
    case "CallExpression":
      return [`${optionalMark(node)}()`];
    case "MemberExpression":
      return [`${optionalMark(node)}${memberAccess(node)}`];
    case "Property":
      if (node.kind === "get" || node.kind === "set") return [String(node.kind)];
      return tokensIf(node.shorthand !== true && node.method !== true, ":");
    case "YieldExpression":
      if (node.delegate === true) return ["yield*"];
      return ["yield"];
    case "JSXAttribute":
      return tokensIf(isNode(node.value), "=");
    case "ArrowFunctionExpression":
    case "FunctionDeclaration":
    case "FunctionExpression":
      return [...tokensIf(node.async === true, "async"), functionOperator(node)];
    default:
      return [];
  }
};

/** Every operator token a node stands for. */
const operatorsOf = (node: AnyNode): ReadonlyArray<string> => [
  ...(fixedOperators.get(node.type) ?? []),
  ...statementOperators(node),
  ...expressionOperators(node),
];

/** The operand a leaf node contributes, if any. */
const operandOf = (node: AnyNode): Option.Option<string> => {
  switch (node.type) {
    case "Identifier":
    case "JSXIdentifier":
      return Option.some(String(node.name));
    case "PrivateIdentifier":
      return Option.some(`#${String(node.name)}`);
    case "Literal":
      return Option.some(literalOperand(node));
    case "TemplateElement":
      return templateOperand(node);
    case "ThisExpression":
      return Option.some("this");
    case "Super":
      return Option.some("super");
    case "MetaProperty":
      return Option.some(`${slotName(node, "meta")}.${slotName(node, "property")}`);
    case "JSXText":
      return Option.liftPredicate(String(node.value).trim(), isNonEmpty);
    default:
      return Option.none();
  }
};

/**
 * Halstead operator and operand counts of one function, excluding nested
 * functions. A nested function contributes only its own `function` or `=>`
 * operator to the enclosing unit.
 */
export const halstead = (fn: FunctionNode): HalsteadCounts => {
  const operators = new Map<string, number>();
  const operands = new Map<string, number>();
  const tally = (into: Map<string, number>, token: string): void => {
    into.set(token, (into.get(token) ?? 0) + 1);
  };

  const visit = (node: AnyNode): void => {
    if (isTypeOnly(node)) return;
    for (const operator of operatorsOf(node)) tally(operators, operator);
    const operand = operandOf(node);
    if (Option.isSome(operand)) tally(operands, operand.value);
    if (isFunctionType(node.type) || node.type === "MetaProperty") return;
    for (const child of children(node)) visit(child);
  };

  for (const root of unitRoots(fn)) visit(root);

  const total = (counts: Map<string, number>): number =>
    Array.from(counts.values()).reduce((sum, count) => sum + count, 0);

  return {
    distinctOperators: operators.size,
    totalOperators: total(operators),
    distinctOperands: operands.size,
    totalOperands: total(operands),
  };
};

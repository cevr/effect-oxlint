/**
 * Whether a virtual-clock advance in a test lets time pass to settle, or
 * moves time to the input under test (common.md WAIT ON EVENTS; the design
 * in no-fixed-wait-in-tests). An advance settles when its amount is a
 * flush (at most a millisecond, S1), its amount is named as a turn rather
 * than a time (S2), or it is repeated (S3). A flush amount right after an
 * earlier advance in the same function is the second step of a boundary
 * pair and is time as input (B); the rule tracks that.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { ancestors } from "./_ast-ancestors.js";
import { isAstNode } from "./_ast-children.js";
import type { ResolveConst } from "./_const-bindings.js";

/** Milliseconds in one unit of each Duration input unit, singular and plural. */
const unitMillis: ReadonlyMap<string, number> = new Map([
  ["nano", 1e-6],
  ["nanos", 1e-6],
  ["micro", 1e-3],
  ["micros", 1e-3],
  ["milli", 1],
  ["millis", 1],
  ["second", 1e3],
  ["seconds", 1e3],
  ["minute", 6e4],
  ["minutes", 6e4],
  ["hour", 3.6e6],
  ["hours", 3.6e6],
  ["day", 8.64e7],
  ["days", 8.64e7],
  ["week", 6.048e8],
  ["weeks", 6.048e8],
]);

/** Duration constructors and the milliseconds in one of their units. */
const constructorMillis: ReadonlyMap<string, number> = new Map([
  ["nanos", 1e-6],
  ["micros", 1e-3],
  ["millis", 1],
  ["seconds", 1e3],
  ["minutes", 6e4],
  ["hours", 3.6e6],
  ["days", 8.64e7],
  ["weeks", 6.048e8],
]);

/** The milliseconds of a Duration input string such as `"1 millis"`. */
const stringMillis = (text: string): Option.Option<number> => {
  const match = /^\s*(\d+(?:\.\d+)?)\s*([a-z]+)\s*$/u.exec(text);
  if (!match) return Option.none();
  const [, amount = "", unit = ""] = match;
  return Option.map(Option.fromUndefinedOr(unitMillis.get(unit)), (per) => Number(amount) * per);
};

const memberProperty = (node: ESTree.Expression): Option.Option<string> => {
  if (node.type !== "MemberExpression" || node.computed) return Option.none();
  if (node.property.type !== "Identifier") return Option.none();
  return Option.some(node.property.name);
};

/** The milliseconds a Duration input denotes, where the source states it. */
export const durationMillis = (
  resolveConst: ResolveConst,
  input: ESTree.Expression,
): Option.Option<number> => {
  const node = resolveConst(input);
  if (node.type === "Literal") {
    const value = node.value;
    if (Predicate.isNumber(value)) return Option.some(value);
    if (Predicate.isString(value)) return stringMillis(value);
    if (Predicate.isBigInt(value)) return Option.some(Number(value) * 1e-6);
    return Option.none();
  }
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return stringMillis(node.quasis.map((quasi) => quasi.value.cooked ?? "").join(""));
  }
  if (Option.contains(memberProperty(node), "zero")) return Option.some(0);
  if (node.type !== "CallExpression" || node.callee.type === "Super") return Option.none();
  const amount = Option.filter(
    Option.fromUndefinedOr(node.arguments[0]),
    (argument): argument is ESTree.Expression => argument.type !== "SpreadElement",
  );
  const per = Option.flatMap(memberProperty(node.callee), (name) =>
    Option.fromUndefinedOr(constructorMillis.get(name)),
  );
  return Option.flatMap(Option.all([amount, per]), ([value, unit]) =>
    Option.map(durationMillis(resolveConst, value), (count) => count * unit),
  );
};

/** S1: an amount of at most one millisecond. */
export const isFlushAmount = (resolveConst: ResolveConst, input: ESTree.Expression): boolean =>
  Option.exists(durationMillis(resolveConst, input), (millis) => millis <= 1);

const turnWords = /flush|settle|tick|drain|yield/iu;

/** S2: the name an amount is read through, when it names a turn rather than a time. */
export const flushName = (input: ESTree.Expression): Option.Option<string> => {
  const names: Array<string> = [];
  if (input.type === "Identifier") names.push(input.name);
  if (input.type === "MemberExpression") names.push(...Option.toArray(memberProperty(input)));
  if (input.type === "TemplateLiteral") {
    for (const expression of input.expressions) {
      if (expression.type === "Identifier") names.push(expression.name);
    }
  }
  return Option.fromUndefinedOr(names.find((name) => turnWords.test(name)));
};

const isFunctionNode = (node: ESTree.Node): boolean =>
  node.type === "ArrowFunctionExpression" ||
  node.type === "FunctionExpression" ||
  node.type === "FunctionDeclaration";

/** Whether a statement list leaves its loop early (`break` or `return`), outside nested functions and loops. */
const exitsEarly = (node: ESTree.Node): boolean => {
  if (node.type === "BreakStatement" || node.type === "ReturnStatement") return true;
  if (isFunctionNode(node) || isLoopStatement(node)) return false;
  return childNodes(node).some(exitsEarly);
};

const isNode = (value: unknown): value is ESTree.Node => isAstNode(value);

/** The nodes directly under `node`, without its parent link. */
const childNodes = (node: ESTree.Node): ReadonlyArray<ESTree.Node> =>
  Object.entries(node)
    .filter(([key]) => key !== "parent")
    .flatMap(([, value]: [string, unknown]) => [value].flat())
    .filter(isNode);

/**
 * A loop that polls until state changes: a `while` or `do` loop, or a
 * counted `for` that leaves early. A `for` over a list of cases runs one
 * scenario per case, and its advances are each case's time.
 */
const isPollingLoop = (node: ESTree.Node): boolean =>
  node.type === "WhileStatement" ||
  node.type === "DoWhileStatement" ||
  (node.type === "ForStatement" && exitsEarly(node.body));

const isLoopStatement = (node: ESTree.Node): boolean =>
  node.type === "ForStatement" ||
  node.type === "ForInStatement" ||
  node.type === "ForOfStatement" ||
  node.type === "WhileStatement" ||
  node.type === "DoWhileStatement";

const repeaters: ReadonlySet<string> = new Set([
  "repeat",
  "repeatN",
  "forever",
  "iterate",
  "loop",
  "whileLoop",
]);

/** Whether a call is `X.repeat(...)` or another repeater, or pipes into one. */
const repeats = (node: ESTree.Node): boolean => {
  if (node.type !== "CallExpression" || node.callee.type === "Super") return false;
  if (Option.exists(memberProperty(node.callee), (name) => repeaters.has(name))) return true;
  if (!Option.contains(memberProperty(node.callee), "pipe")) return false;
  return node.arguments.some(
    (argument) =>
      argument.type === "CallExpression" &&
      argument.callee.type !== "Super" &&
      Option.exists(memberProperty(argument.callee), (name) => repeaters.has(name)),
  );
};

/** S3: the advance runs in a loop or under a repeater, within its own function. */
export const isRepeated = (advance: ESTree.Node): boolean => {
  for (const ancestor of ancestors(advance)) {
    if (isPollingLoop(ancestor) || repeats(ancestor)) return true;
    if (isFunctionNode(ancestor)) return false;
  }
  return false;
};

/** The function an advance runs in (the Program at top level): the scope of a boundary pair. */
export const enclosingFunction = (advance: ESTree.Node): ESTree.Node => {
  let last: ESTree.Node = advance;
  for (const ancestor of ancestors(advance)) {
    if (isFunctionNode(ancestor)) return ancestor;
    last = ancestor;
  }
  return last;
};

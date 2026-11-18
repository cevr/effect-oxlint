/**
 * Test cases and their expectations, for the weak-test rules: a case is
 * `it(name, fn)` / `test(name, fn)` and its modifiers (`it.only`,
 * `it.effect`, `test.concurrent`, …), not `.each`, `.skip` or `.todo`; an
 * expectation is `expect(subject)[.not|.resolves|.rejects].matcher(…)`.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";

import { ancestorsOf, isFunction, walk } from "./_anti-slop-effect.js";
import type { FunctionNode } from "./_anti-slop-effect.js";

const runners: ReadonlySet<string> = new Set(["it", "test"]);
const excluded: ReadonlySet<string> = new Set(["each", "skip", "todo", "fails"]);

export interface TestCase {
  readonly call: ESTree.CallExpression;
  readonly fn: FunctionNode;
}

/** The runner name and the modifiers of a callee: `it.effect.only` → `it`, [effect, only]. */
export const calleeChain = (callee: ESTree.Node): Option.Option<ReadonlyArray<string>> => {
  if (callee.type === "Identifier") return Option.some([callee.name]);
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier"
  ) {
    const name = callee.property.name;
    return Option.map(calleeChain(callee.object), (chain) => [...chain, name]);
  }
  return Option.none();
};

/** The case a call declares, if it is one. */
export const testCaseOf = (call: ESTree.CallExpression): Option.Option<TestCase> => {
  const runner = Option.filter(
    calleeChain(call.callee),
    (chain) => runners.has(chain[0] ?? "") && !chain.slice(1).some((name) => excluded.has(name)),
  );
  if (Option.isNone(runner) || call.arguments.length < 2) return Option.none();
  return Option.map(Arr.findFirst(call.arguments, isFunction), (fn) => ({ call, fn }));
};

export interface Expectation {
  /** The whole `expect(…)….matcher(…)` call. */
  readonly node: ESTree.CallExpression;
  readonly matcher: string;
  readonly subject: Option.Option<ESTree.Node>;
  readonly expected: Option.Option<ESTree.Node>;
}

/** `expect(subject)` under `.not` / `.resolves` / `.rejects`: the subject. */
const expectSubject = (receiver: ESTree.Node): Option.Option<Option.Option<ESTree.Node>> => {
  let current = receiver;
  while (current.type === "MemberExpression") current = current.object;
  if (
    current.type === "CallExpression" &&
    current.callee.type === "Identifier" &&
    current.callee.name === "expect"
  ) {
    return Option.some(Option.fromNullishOr(current.arguments[0]));
  }
  return Option.none();
};

const expectationOf = (node: ESTree.Node): Option.Option<Expectation> => {
  if (node.type !== "CallExpression") return Option.none();
  const callee = node.callee;
  if (
    callee.type !== "MemberExpression" ||
    callee.computed ||
    callee.property.type !== "Identifier"
  ) {
    return Option.none();
  }
  const matcher = callee.property.name;
  return Option.map(expectSubject(callee.object), (subject) => ({
    node,
    matcher,
    subject,
    expected: Option.fromNullishOr(node.arguments[0]),
  }));
};

/** The expectations inside a node, in source order. */
export const expectationsIn = (node: ESTree.Node): ReadonlyArray<Expectation> => {
  const found: Array<Expectation> = [];
  walk(node, (child) => {
    Option.map(expectationOf(child), (expectation) => found.push(expectation));
    return true;
  });
  return found;
};

/** The statement that holds a node: the outermost ancestor below a block or the program. */
export const statementOf = (node: ESTree.Node): ESTree.Node => {
  let child = node;
  for (const ancestor of ancestorsOf(node)) {
    if (ancestor.type === "BlockStatement" || ancestor.type === "Program") return child;
    child = ancestor;
  }
  return child;
};

/** A comment marker that names why a flagged form is the contract: `contract: <reason>`. */
export const contractNote = /\bcontract:\s*\S/u;

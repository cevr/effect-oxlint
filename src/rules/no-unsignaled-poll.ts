/**
 * A poll of a mock's call count or a recorder's length waits for the code
 * under test to have run, not for what it did: it passes the moment the call
 * happens, however wrong its result, and it still guesses an interval. The
 * code under test should hand the test a signal (a promise it settles, a
 * Deferred it completes, an event it emits). LANDMINES LM-WAIT (b), after
 * landmines' `testing/no-unsignaled-poll`.
 *
 * Reported in test modules:
 * - `expect.poll(fn)` whose polled value is spy state (it reads `.mock`) or a
 *   recorder's size (it ends in `.length` or `.size`), or whose matcher is a
 *   spy matcher (`expect.poll(() => spy).toHaveBeenCalledTimes(1)`);
 * - `vi.waitFor(fn)` and `waitFor(fn)` whose callback reads `.mock`, asserts
 *   with a spy matcher, or asserts on a `.length` or `.size`;
 * - a hand-written poll loop: a `while` or `do` whose condition reads `.mock`,
 *   `.length` or `.size` (a counter) and whose body waits on time (a call of
 *   a sleep, wait, delay, tick or setTimeout). A loop that drains a queue or
 *   walks an array waits on no time, and a `for` loop is an iteration.
 * A poll of anything else (a locator, `ref.current`, a value the subject
 * returns) is left alone, and so is noFixedWaitInTests' business, the
 * interval itself.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { contains, isFunction } from "./_anti-slop-effect.js";
import { parentOf } from "./_ast-ancestors.js";
import { calleeChain } from "./_test-cases.js";
import { isTestModule, skipFile } from "./_test-files.js";

const spyMatcher =
  /^(?:toHaveBeenCalled|toHaveBeenCalledTimes|toHaveBeenCalledWith|toHaveBeenLastCalledWith|toHaveBeenNthCalledWith|toHaveReturned|toHaveReturnedTimes|toHaveReturnedWith|toHaveLastReturnedWith|toHaveNthReturnedWith|toBeCalled|toBeCalledTimes|toBeCalledWith)$/u;

const message =
  "This poll waits for a mock's calls or a recorder's count, so it passes once the code under test has run, whatever it did, and still guesses an interval. Have the code under test signal the test (a promise it settles, a Deferred it completes, an event it emits) and assert on the result it produced.";

/** The name a non-computed member expression reads. */
const memberName = (node: ESTree.Node): Option.Option<string> => {
  if (node.type !== "MemberExpression" || node.computed || node.property.type !== "Identifier") {
    return Option.none();
  }
  return Option.some(node.property.name);
};

/** A read of spy state: `spy.mock…`. */
const readsMock = (node: ESTree.Node): boolean =>
  contains(node, (child) => !isFunction(child) && Option.contains(memberName(child), "mock"));

/** A recorder's size: an expression that ends in `.length` or `.size`. */
const isCount = (node: ESTree.Node): boolean =>
  Option.exists(memberName(node), (name) => name === "length" || name === "size");

/** A condition that reads a counter: `.mock`, or a `.length`/`.size` read anywhere in it. */
const readsCounter = (node: ESTree.Node): boolean =>
  readsMock(node) || contains(node, (child) => !isFunction(child) && isCount(child));

/** The value a callback returns: its expression body, or a body that is one `return`. */
const returned = (fn: ESTree.Node): Option.Option<ESTree.Node> => {
  if (fn.type !== "ArrowFunctionExpression" && fn.type !== "FunctionExpression")
    return Option.none();
  return Option.flatMap(Option.fromNullOr(fn.body), (body) => {
    if (body.type !== "BlockStatement") return Option.some(body);
    const [only, ...rest] = body.body;
    if (rest.length > 0 || only?.type !== "ReturnStatement") return Option.none();
    return Option.fromNullOr(only.argument);
  });
};

/** Whether a call asserts with a spy matcher: `expect(spy).toHaveBeenCalled…(…)`. */
const isSpyAssertion = (node: ESTree.Node): boolean =>
  node.type === "CallExpression" &&
  Option.exists(memberName(node.callee), (name) => spyMatcher.test(name));

/** Whether a call asserts on a count: `expect(x.length).toBe(…)`. */
const isCountAssertion = (node: ESTree.Node): boolean => {
  if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression") return false;
  const subject = node.callee.object;
  if (subject.type !== "CallExpression" || subject.callee.type !== "Identifier") return false;
  return (
    subject.callee.name === "expect" &&
    Option.exists(Option.fromUndefinedOr(subject.arguments[0]), isCount)
  );
};

/** The matcher called on a call's result: `toHaveBeenCalledTimes` in `expect.poll(f).not.toHaveBeenCalledTimes(1)`. */
const matcherAfter = (call: ESTree.Node): Option.Option<string> =>
  Option.flatMap(parentOf(call), (parent) => {
    if (parent.type !== "MemberExpression" || parent.object !== call) return Option.none();
    const name = memberName(parent);
    if (Option.contains(name, "not") || Option.contains(name, "resolves"))
      return matcherAfter(parent);
    return name;
  });

/** The name a call calls: `sleep` in `sleep(1)`, `Bun.sleep(1)`, `scheduler.wait(1)`. */
const calledName = (node: ESTree.Node): Option.Option<string> => {
  if (node.type !== "CallExpression") return Option.none();
  if (node.callee.type === "Identifier") return Option.some(node.callee.name);
  return memberName(node.callee);
};

const timeWait = /^(?:sleep|sleepSync|wait|delay|tick|setTimeout|waitForTimeout)$/u;

/** Whether a loop body waits on time: a call of a sleep, wait, delay, tick or setTimeout. */
const waitsOnTime = (body: ESTree.Node): boolean =>
  contains(body, (child) => Option.exists(calledName(child), (name) => timeWait.test(name)));

export const noUnsignaledPoll = Rule.define({
  name: "no-unsignaled-poll",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Ban polls (expect.poll, vi.waitFor, a hand-written loop) of a mock's calls or a recorder's count in tests: have the code under test signal the test.",
    docs: { recommended: false },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (!isTestModule(ctx)) return skipFile;
    const report = (node: ESTree.Node) => ctx.report(Diagnostic.make({ node, message }));
    const pollOfCounter = (node: ESTree.CallExpression): boolean => {
      const chain = Option.getOrElse(calleeChain(node.callee), () => []).join(".");
      const first = Option.fromUndefinedOr(node.arguments[0]);
      if (Option.isNone(first)) return false;
      const fn = first.value;
      if (chain === "expect.poll") {
        if (Option.exists(matcherAfter(node), (name) => spyMatcher.test(name))) return true;
        return Option.exists(returned(fn), (value) => readsMock(value) || isCount(value));
      }
      if (chain === "vi.waitFor" || chain === "waitFor") {
        if (!isFunction(fn)) return false;
        return (
          readsMock(fn) || contains(fn, (child) => isSpyAssertion(child) || isCountAssertion(child))
        );
      }
      return false;
    };
    const loopOfCounter = (node: ESTree.WhileStatement | ESTree.DoWhileStatement): boolean =>
      readsCounter(node.test) && waitsOnTime(node.body);
    const reportLoop = (node: ESTree.WhileStatement | ESTree.DoWhileStatement) => {
      if (!loopOfCounter(node)) return Effect.void;
      return report(node);
    };
    return {
      CallExpression: (node: ESTree.CallExpression) => {
        if (!pollOfCounter(node)) return Effect.void;
        return report(node);
      },
      WhileStatement: reportLoop,
      DoWhileStatement: reportLoop,
    };
  },
});

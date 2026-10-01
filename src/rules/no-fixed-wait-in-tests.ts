/**
 * Tests wait on the event they depend on or advance virtual time, never on a wall-clock guess.
 *
 * Reported in test modules: a sleep (`Effect.sleep`, `Bun.sleep`,
 * `Bun.sleepSync`, `setTimeout` from `timers/promises`) a statement runs, and
 * each sleep anywhere inside the argument of a `yield*` or an `await` (piped,
 * raced, sequenced, or bound to a result); a sleep stored under a name, in a
 * variable's initializer or an object field, since a later `yield* pause`
 * waits on it where no wait shows the sleep; `waitForTimeout`; and a Promise
 * only a timer settles. A sleep inside a nested function is a value the callee
 * may never run, such as a mock's `read: () => Effect.sleep(...)`, and stays
 * allowed. A real-clock fence the subject needs takes a line-local
 * suppression with its reason.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { childNodesAt, isAstNode } from "./_ast-children.js";
import { importedNamespaces, isStaticCall, visibleNamespaces } from "./_effect-namespaces.js";
import { isTestModule, skipFile } from "./_test-files.js";

type VisitorKeys = Readonly<Record<string, ReadonlyArray<string>>>;

const isNode = (value: unknown): value is ESTree.Node => isAstNode(value);

const isFunctionNode = (node: ESTree.Node): boolean =>
  node.type === "ArrowFunctionExpression" ||
  node.type === "FunctionExpression" ||
  node.type === "FunctionDeclaration";

/** Where a stored value's walk stops: a function it builds, or a wait the waited walk reports. */
const isStoredStop = (node: ESTree.Node): boolean =>
  isFunctionNode(node) || node.type === "YieldExpression" || node.type === "AwaitExpression";

/** `node` and every node under it, without the subtrees whose root `stop` cuts off. */
const descendants = (
  node: ESTree.Node,
  keys: VisitorKeys,
  stop: (child: ESTree.Node) => boolean,
): ReadonlyArray<ESTree.Node> => [
  node,
  ...(keys[node.type] ?? [])
    .flatMap((key) => childNodesAt(node, key, isNode))
    .filter((child) => !stop(child))
    .flatMap((child) => descendants(child, keys, stop)),
];

const guidance =
  "A fixed wait guesses when state changes, so it flakes under load and slows the suite. Advance virtual time with TestClock.adjust, or wait on the event itself: a Deferred, Latch, or Queue in Effect code, a condition or locator assertion (expect.poll, waitForFunction) in a browser.";

/** Unwrap `yield* x`, `await x`, and `void x` to the waited expression. */
const waited = (node: ESTree.Expression): ESTree.Expression => {
  if (node.type === "YieldExpression" && node.delegate && node.argument) {
    return waited(node.argument);
  }
  if (node.type === "AwaitExpression") return waited(node.argument);
  if (node.type === "UnaryExpression" && node.operator === "void") return waited(node.argument);
  return node;
};

const isMemberCall = (node: ESTree.Expression, object: string, property: string): boolean =>
  node.type === "CallExpression" &&
  node.callee.type === "MemberExpression" &&
  !node.callee.computed &&
  node.callee.object.type === "Identifier" &&
  node.callee.object.name === object &&
  node.callee.property.type === "Identifier" &&
  node.callee.property.name === property;

const isPropertyCall = (node: ESTree.CallExpression, property: string): boolean =>
  node.callee.type === "MemberExpression" &&
  !node.callee.computed &&
  node.callee.property.type === "Identifier" &&
  node.callee.property.name === property;

const isIdentifierCall = (node: ESTree.Node, names: ReadonlySet<string>): boolean =>
  node.type === "CallExpression" &&
  node.callee.type === "Identifier" &&
  names.has(node.callee.name);

/** The one expression an executor body evaluates: an expression body, or a single expression statement. */
const soleExpression = (
  body: ESTree.ArrowFunctionExpression["body"] | ESTree.FunctionBody,
): Option.Option<ESTree.Node> => {
  if (body.type !== "BlockStatement") return Option.some(body);
  const [only, ...rest] = body.body;
  if (rest.length > 0 || only?.type !== "ExpressionStatement") return Option.none();
  return Option.some(only.expression);
};

/** Whether `node` is `setTimeout(<name>, ...)`. */
const isTimerSettling = (node: ESTree.Node, name: string): boolean => {
  if (node.type !== "CallExpression" || node.callee.type !== "Identifier") return false;
  const [first] = node.arguments;
  return node.callee.name === "setTimeout" && first?.type === "Identifier" && first.name === name;
};

/** `new Promise((resolve) => setTimeout(resolve, n))`: a promise that only a timer settles. */
const isTimerPromise = (node: ESTree.NewExpression): boolean => {
  if (node.callee.type !== "Identifier" || node.callee.name !== "Promise") return false;
  const [executor] = node.arguments;
  if (executor?.type !== "ArrowFunctionExpression" && executor?.type !== "FunctionExpression") {
    return false;
  }
  const [resolve] = executor.params;
  if (resolve?.type !== "Identifier") return false;
  const body = Option.flatMap(Option.fromNullOr(executor.body), soleExpression);
  return Option.exists(body, (call) => isTimerSettling(call, resolve.name));
};

export const noFixedWaitInTests = Rule.define({
  name: "no-fixed-wait-in-tests",
  meta: Rule.meta({
    type: "problem",
    description:
      "Bans fixed waits in tests (a waited or stored Effect.sleep or Bun.sleep, waitForTimeout, a timer-only Promise); use TestClock or wait on the event.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (!isTestModule(ctx)) return skipFile;
    const effectNamespaces = new Set(["Effect"]);
    const timerPromiseNames = new Set<string>();

    const keys: VisitorKeys = ctx.sourceCode.visitorKeys;
    /** Sleeps already reported: a statement's sleep is also inside its `yield*` or `await`. */
    const reported = new Set<ESTree.Node>();

    const report = (node: ESTree.Node, wait: string) =>
      ctx.report(
        Diagnostic.make({ node, message: `Avoid a fixed wait in tests (${wait}). ${guidance}` }),
      );

    /** The sleep a call runs: `Effect.sleep`, `Bun.sleep`, or `setTimeout` from timers/promises. */
    const sleepWait = (node: ESTree.Node): Option.Option<string> => {
      if (node.type !== "CallExpression") return Option.none();
      const effects = visibleNamespaces(ctx, node, effectNamespaces);
      if (isStaticCall(node, effects, "sleep")) return Option.some("Effect.sleep");
      if (isMemberCall(node, "Bun", "sleep") || isMemberCall(node, "Bun", "sleepSync")) {
        return Option.some("Bun.sleep");
      }
      if (isIdentifierCall(node, timerPromiseNames))
        return Option.some("setTimeout from timers/promises");
      return Option.none();
    };

    const reportSleep = (node: ESTree.Node) =>
      Option.match(
        Option.filter(sleepWait(node), () => !reported.has(node)),
        {
          onNone: () => Effect.void,
          onSome: (wait) => {
            reported.add(node);
            return report(node, wait);
          },
        },
      );

    /** Each sleep a `yield*` or `await` waits on, outside the functions its argument builds. */
    const reportWaited = (argument: ESTree.Node) =>
      Effect.forEach(descendants(argument, keys, isFunctionNode), reportSleep, { discard: true });

    /** Each sleep a value holds, outside its functions and its waits (`reportWaited` owns those). */
    const reportStored = (value: ESTree.Node) => {
      if (isStoredStop(value)) return Effect.void;
      return Effect.forEach(descendants(value, keys, isStoredStop), reportSleep, {
        discard: true,
      });
    };

    return {
      VariableDeclarator: (node: ESTree.VariableDeclarator) =>
        Option.match(Option.fromNullishOr(node.init), {
          onNone: () => Effect.void,
          onSome: reportStored,
        }),
      Property: (node: ESTree.ObjectProperty) => reportStored(node.value),
      ImportDeclaration: (node: ESTree.ImportDeclaration) => {
        for (const name of importedNamespaces(node, "Effect", "effect/Effect")) {
          effectNamespaces.add(name);
        }
        const source = node.source.value;
        if (source === "node:timers/promises" || source === "timers/promises") {
          for (const specifier of node.specifiers) {
            if (
              specifier.type === "ImportSpecifier" &&
              specifier.imported.type === "Identifier" &&
              specifier.imported.name === "setTimeout"
            ) {
              timerPromiseNames.add(specifier.local.name);
            }
          }
        }
        return Effect.void;
      },
      ExpressionStatement: (node: ESTree.ExpressionStatement) =>
        reportSleep(waited(node.expression)),
      YieldExpression: (node: ESTree.YieldExpression) => {
        if (!node.delegate || !node.argument) return Effect.void;
        return reportWaited(node.argument);
      },
      AwaitExpression: (node: ESTree.AwaitExpression) => reportWaited(node.argument),
      CallExpression: (node: ESTree.CallExpression) => {
        if (!isPropertyCall(node, "waitForTimeout")) return Effect.void;
        return report(node, "waitForTimeout");
      },
      NewExpression: (node: ESTree.NewExpression) => {
        if (!isTimerPromise(node)) return Effect.void;
        return report(node, "a Promise settled by setTimeout");
      },
    };
  },
});

/**
 * Tests wait on the event they depend on, never on time passing, real or virtual.
 *
 * Reported in test modules: a sleep (`Effect.sleep`, `Bun.sleep`,
 * `Bun.sleepSync`, `scheduler.wait`, `setTimeout` from `timers/promises`) a statement runs, and
 * each sleep anywhere inside the argument of a `yield*` or an `await` (piped,
 * raced, sequenced, or bound to a result); a sleep stored under a name, in a
 * variable's initializer or an object field, since a later `yield* pause`
 * waits on it where no wait shows the sleep; `waitForTimeout`; and a Promise
 * only a timer settles (`setTimeout`, or it through `globalThis`/`window`,
 * whose handler is the resolver or a function that only calls it), unless it
 * is an arm of `Promise.race`/`Promise.any` or a network route handler's
 * delay (LANDMINES LM-WAIT). A sleep inside a nested function is a value the callee
 * may never run, such as a mock's `read: () => Effect.sleep(...)`, and stays
 * allowed. A real-clock fence the subject needs takes a line-local
 * suppression with its reason.
 *
 * A virtual-clock advance (`TestClock.adjust`, `TestClock.setTime`) is
 * reported where it lets time pass to settle rather than moving time to the
 * input under test: an amount of at most a millisecond (S1), an amount read
 * through a name that says flush, settle, tick, drain or yield (S2), or an
 * advance in a loop or under a repeater (S3). A flush amount after an earlier
 * advance in the same function is the second step of a boundary pair
 * (`adjust("999 millis")`, assert, `adjust("1 millis")`, assert) and stays
 * allowed, as does every other advance: `adjust("5 seconds")` then an
 * assertion of what a timeout did is time as the input. A large advance used
 * only to let a fiber start is not caught: telling it apart needs the
 * subject's code.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { ancestors } from "./_ast-ancestors.js";
import { childNodesAt, isAstNode } from "./_ast-children.js";
import { constResolver } from "./_const-bindings.js";
import { importedNamespaces, isStaticCall, visibleNamespaces } from "./_effect-namespaces.js";
import { isTestModule, skipFile } from "./_test-files.js";
import {
  enclosingFunction,
  flushName,
  isConditionPollInterval,
  isFlushAmount,
  isRepeated,
} from "./_virtual-time.js";

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
  "A fixed wait guesses when state changes, so it flakes under load and slows the suite. Wait on the event itself: a Deferred, Latch, Queue, or Fiber.join in Effect code, a locator assertion (`await expect(locator).toBeVisible()`) in a browser, or a promise the code under test settles. Advance TestClock only to the time under test.";

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

/** The global objects a timer is reached through: `globalThis.setTimeout`, `window.setTimeout`. */
const timerHosts: ReadonlySet<string> = new Set(["globalThis", "window", "self", "global"]);

/** Whether a callee names the timer: `setTimeout`, or it through a global object. */
const isSetTimeout = (callee: ESTree.Node): boolean => {
  if (callee.type === "Identifier") return callee.name === "setTimeout";
  return (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    timerHosts.has(callee.object.name) &&
    callee.property.type === "Identifier" &&
    callee.property.name === "setTimeout"
  );
};

/** Whether a timer's handler only settles the promise: `resolve`, or a function that only calls it. */
const onlyResolves = (handler: ESTree.Node, name: string): boolean => {
  if (handler.type === "Identifier") return handler.name === name;
  if (handler.type !== "ArrowFunctionExpression" && handler.type !== "FunctionExpression")
    return false;
  if (handler.params.length > 0) return false;
  const body = Option.flatMap(Option.fromNullOr(handler.body), soleExpression);
  return Option.exists(
    body,
    (call) =>
      call.type === "CallExpression" &&
      call.arguments.length === 0 &&
      call.callee.type === "Identifier" &&
      call.callee.name === name,
  );
};

/** Whether `node` is `setTimeout(<name>, ...)`, through a global or with a handler that only calls it. */
const isTimerSettling = (node: ESTree.Node, name: string): boolean =>
  node.type === "CallExpression" &&
  isSetTimeout(node.callee) &&
  Option.exists(Option.fromUndefinedOr(node.arguments[0]), (handler) =>
    onlyResolves(handler, name),
  );

/**
 * Whether a timer promise is a signal of its own rather than a wait: an arm
 * of `Promise.race`/`Promise.any` (a deadline beside the event), or a delay
 * a network route handler adds to the response it serves (`page.route`).
 */
const isTimerSignal = (node: ESTree.Node): boolean => {
  for (const ancestor of ancestors(node)) {
    if (ancestor.type !== "CallExpression" || ancestor.callee.type !== "MemberExpression") continue;
    const property = ancestor.callee.property;
    if (property.type !== "Identifier") continue;
    const promise =
      ancestor.callee.object.type === "Identifier" && ancestor.callee.object.name === "Promise";
    if (promise && (property.name === "race" || property.name === "any")) return true;
    if (property.name === "route" || property.name === "routeFromHAR") return true;
  }
  return false;
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

/** The local names of `TestClock` an import binds: from effect, effect/testing, or its own module. */
const testClockImports = (node: ESTree.ImportDeclaration): ReadonlyArray<string> => {
  const source = node.source.value;
  const own = source === "effect/TestClock" || source === "effect/testing/TestClock";
  const barrel = source === "effect" || source === "effect/testing";
  return node.specifiers.flatMap((specifier) => {
    if (specifier.type === "ImportNamespaceSpecifier" && own) return [specifier.local.name];
    if (
      specifier.type === "ImportSpecifier" &&
      barrel &&
      specifier.imported.type === "Identifier" &&
      specifier.imported.name === "TestClock"
    ) {
      return [specifier.local.name];
    }
    return [];
  });
};

export const noFixedWaitInTests = Rule.define({
  name: "no-fixed-wait-in-tests",
  meta: Rule.meta({
    type: "problem",
    description:
      "Bans waiting by time in tests (a waited or stored Effect.sleep or Bun.sleep, waitForTimeout, a timer-only Promise, a TestClock advance that only lets fibers settle); wait on the event.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (!isTestModule(ctx)) return skipFile;
    const effectNamespaces = new Set(["Effect"]);
    const timerPromiseNames = new Set<string>();
    const testClocks = new Set(["TestClock"]);
    const resolveConst = constResolver(ctx);
    /** The functions an advance already ran in: a later flush there is a boundary step (B). */
    const advancedIn = new Set<ESTree.Node>();

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
      if (isMemberCall(node, "scheduler", "wait")) return Option.some("scheduler.wait");
      if (isIdentifierCall(node, timerPromiseNames))
        return Option.some("setTimeout from timers/promises");
      return Option.none();
    };

    /** Why an advance of the virtual clock settles, if it does (S1, S2, S3; B exempts S1). */
    const settling = (node: ESTree.CallExpression, method: string): Option.Option<string> => {
      const amount = Option.filter(
        Option.fromUndefinedOr(node.arguments[0]),
        (argument): argument is ESTree.Expression => argument.type !== "SpreadElement",
      );
      if (Option.isNone(amount)) return Option.none();
      const scope = enclosingFunction(node);
      const boundaryStep = advancedIn.has(scope);
      advancedIn.add(scope);
      if (isRepeated(node)) return Option.some(`TestClock.${method} in a loop`);
      const named = flushName(amount.value);
      if (Option.isSome(named)) return Option.some(`TestClock.${method} by ${named.value}`);
      if (method === "adjust" && !boundaryStep && isFlushAmount(resolveConst, amount.value)) {
        return Option.some("TestClock.adjust by a flush amount");
      }
      return Option.none();
    };

    const reportAdvance = (node: ESTree.CallExpression) => {
      const clocks = visibleNamespaces(ctx, node, testClocks);
      const method = Option.fromUndefinedOr(
        ["adjust", "setTime"].find((name) => isStaticCall(node, clocks, name)),
      );
      return Option.match(
        Option.flatMap(method, (name) => settling(node, name)),
        {
          onNone: () => Effect.void,
          onSome: (wait) => report(node, wait),
        },
      );
    };

    const reportSleep = (node: ESTree.Node) =>
      Option.match(
        Option.filter(sleepWait(node), () => !reported.has(node) && !isConditionPollInterval(node)),
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
        for (const name of testClockImports(node)) testClocks.add(name);
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
        if (!isPropertyCall(node, "waitForTimeout")) return reportAdvance(node);
        return report(node, "waitForTimeout");
      },
      NewExpression: (node: ESTree.NewExpression) => {
        if (!isTimerPromise(node) || isTimerSignal(node)) return Effect.void;
        return report(node, "a Promise settled by setTimeout");
      },
    };
  },
});

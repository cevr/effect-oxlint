/** Tests wait on the event they depend on or advance virtual time, never on a wall-clock guess. */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { importedNamespaces, isStaticCall, visibleNamespaces } from "./_effect-namespaces.js";
import { isTestFile, skipFile } from "./_test-files.js";

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
      "Bans fixed waits in tests (a waited Effect.sleep or Bun.sleep, waitForTimeout, a timer-only Promise); use TestClock or wait on the event.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (!isTestFile(ctx.filename)) return skipFile;
    const effectNamespaces = new Set(["Effect"]);
    const timerPromiseNames = new Set<string>();

    const report = (node: ESTree.Node, wait: string) =>
      ctx.report(
        Diagnostic.make({ node, message: `Avoid a fixed wait in tests (${wait}). ${guidance}` }),
      );

    /** The wait a statement blocks on, when it is a sleep whose value the test never uses. */
    const statementWait = (node: ESTree.Expression): Option.Option<string> => {
      const effects = visibleNamespaces(ctx, node, effectNamespaces);
      if (isStaticCall(node, effects, "sleep")) return Option.some("Effect.sleep");
      if (isMemberCall(node, "Bun", "sleep") || isMemberCall(node, "Bun", "sleepSync")) {
        return Option.some("Bun.sleep");
      }
      if (isIdentifierCall(node, timerPromiseNames))
        return Option.some("setTimeout from timers/promises");
      return Option.none();
    };

    return {
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
      ExpressionStatement: (node: ESTree.ExpressionStatement) => {
        const expression = waited(node.expression);
        return Option.match(statementWait(expression), {
          onNone: () => Effect.void,
          onSome: (wait) => report(expression, wait),
        });
      },
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

/**
 * A test that needs a retry or a raised timeout to pass is not proven: a
 * retry reruns it until a race goes its way, and a raised timeout lets a
 * slow or hanging wait pass. LANDMINES LM-FLAKE, after landmines'
 * `testing/no-flake-masking`.
 *
 * Reported, in test modules and runner configs (`vitest.config.*`,
 * `vite.config.*`, `vitest.workspace.*`, `jest.config.*`,
 * `playwright.config.*`):
 * - on a call of `test`, `it` or `describe` and their modifiers
 *   (`it.effect`, `it.scoped`, `it.live`, `it.layer`, `test.concurrent`, …,
 *   and the case call of `test.each(table)(…)`): a `retry` or `timeout` key of
 *   an options object, and a number as the last argument (Vitest's and
 *   Bun's timeout);
 * - `testTimeout`, `hookTimeout` or `retry` in the object of a config's
 *   `test:` key, and in `vi.setConfig(…)`;
 * - `it.flakyTest(…)`, @effect/vitest's retry until it passes.
 * An object with a `retry` key that is no test's option is left alone.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { calleeChain } from "./_test-cases.js";
import { isTestModule, skipFile } from "./_test-files.js";

const runners: ReadonlySet<string> = new Set(["it", "test", "describe"]);
const caseMasks: ReadonlySet<string> = new Set(["retry", "timeout"]);
const configMasks: ReadonlySet<string> = new Set(["retry", "testTimeout", "hookTimeout"]);
const runnerConfig =
  /(?:^|\/)(?:vitest\.config|vite\.config|vitest\.workspace|jest\.config|playwright\.config)\.[cm]?[jt]s$/u;

const retryAdvice =
  "Make the test deterministic instead: wait for the event it needs (a Deferred, a Fiber's result, a locator), and drive time with TestClock.";

const maskMessage = (key: string): string => {
  if (key === "retry")
    return `\`retry\` reruns a failing test until it passes, so a race or an order bug ships green. ${retryAdvice}`;
  return `\`${key}\` raises the time a test may take, so a slow or hanging wait passes instead of failing. Find what the test waits for and wait for that event, not for more time. ${retryAdvice}`;
};

/** The name of a property's key: `retry` in `{ retry: 3 }` or `{ "retry": 3 }`. */
const keyName = (
  property: ESTree.ObjectExpression["properties"][number],
): Option.Option<string> => {
  if (property.type !== "Property" || property.computed) return Option.none();
  if (property.key.type === "Identifier") return Option.some(property.key.name);
  if (property.key.type === "Literal" && Predicate.isString(property.key.value))
    return Option.some(property.key.value);
  return Option.none();
};

/** The properties of an object whose keys are in `keys`. */
const maskingProperties = (
  object: ESTree.ObjectExpression,
  keys: ReadonlySet<string>,
): ReadonlyArray<readonly [ESTree.Node, string]> =>
  object.properties.flatMap((property) =>
    Option.toArray(
      Option.map(
        Option.filter(keyName(property), (name) => keys.has(name)),
        (name): readonly [ESTree.Node, string] => [property, name],
      ),
    ),
  );

/** The masking properties of every object literal among a call's arguments. */
const maskingArguments = (
  call: ESTree.CallExpression,
  keys: ReadonlySet<string>,
): ReadonlyArray<readonly [ESTree.Node, string]> =>
  call.arguments.flatMap((argument) => {
    if (argument.type !== "ObjectExpression") return [];
    return maskingProperties(argument, keys);
  });

/** What a runner call masks: its options' keys, and a timeout given as its last argument. */
const caseMasksOf = (
  call: ESTree.CallExpression,
): ReadonlyArray<readonly [ESTree.Node, string]> => {
  const options = maskingArguments(call, caseMasks);
  const last = call.arguments.at(-1);
  if (last?.type === "Literal" && Predicate.isNumber(last.value))
    return [...options, [last, "timeout"] as const];
  return options;
};

/**
 * The runner chain of a call's callee: `it.effect` → [it, effect]; for the
 * case call of `test.each(table)(name, fn, options)`, the chain of the call
 * that took the table.
 */
const runnerChain = (callee: ESTree.Node): Option.Option<ReadonlyArray<string>> => {
  if (callee.type === "CallExpression") return calleeChain(callee.callee);
  return calleeChain(callee);
};

export const noFlakeMasking = Rule.define({
  name: "no-flake-masking",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Ban retries and raised timeouts on tests (options, a timeout argument, runner config, vi.setConfig, it.flakyTest): a test that needs them proves nothing.",
    docs: { recommended: false },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const config = runnerConfig.test(ctx.filename.replaceAll("\\", "/"));
    if (!config && !isTestModule(ctx)) return skipFile;
    const reportAll = (masks: ReadonlyArray<readonly [ESTree.Node, string]>) =>
      Effect.forEach(
        masks,
        ([node, key]) => ctx.report(Diagnostic.make({ node, message: maskMessage(key) })),
        {
          discard: true,
        },
      );
    return {
      CallExpression: (node: ESTree.CallExpression) => {
        const chain = Option.getOrElse(runnerChain(node.callee), () => []);
        const [runner = "", ...modifiers] = chain;
        if (runner === "vi" && modifiers.length === 1 && modifiers[0] === "setConfig") {
          return reportAll(maskingArguments(node, configMasks));
        }
        const flaky =
          modifiers.includes("flakyTest") || (runner === "flakyTest" && modifiers.length === 0);
        if (!flaky && !runners.has(runner)) return Effect.void;
        if (flaky) {
          return ctx.report(
            Diagnostic.make({
              node,
              message: `\`${chain.join(".")}\` retries an effect until it succeeds, so a test that fails sometimes passes. ${retryAdvice}`,
            }),
          );
        }
        return reportAll(caseMasksOf(node));
      },
      Property: (node: ESTree.ObjectProperty) => {
        if (!config || Option.getOrElse(keyName(node), () => "") !== "test") return Effect.void;
        if (node.value.type !== "ObjectExpression") return Effect.void;
        return reportAll(maskingProperties(node.value, configMasks));
      },
    };
  },
});

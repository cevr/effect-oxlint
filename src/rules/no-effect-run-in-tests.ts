/**
 * Run test Effects through the test runner's Effect integration, not by hand.
 *
 * Reported in test modules: the `Effect.run*` statics, `ManagedRuntime.make`,
 * and a runner method (`runPromise`, `runSync`, `runFork`, ...) on any other
 * value, such as `runtime.runPromise` or `ui.clientRuntime.runPromiseExit`,
 * whether called or passed as a reference. A test's Promise edge kept in a
 * boundary file takes an override that turns this rule off there.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";
import { isTestModule, skipFile } from "./_test-files.js";

const effectRunners = [
  "runCallback",
  "runCallbackWith",
  "runFork",
  "runForkWith",
  "runPromise",
  "runPromiseExit",
  "runPromiseExitWith",
  "runPromiseWith",
  "runSync",
  "runSyncExit",
  "runSyncExitWith",
  "runSyncWith",
];

/** The rightmost name of a runtime receiver: `runtime`, or `ui.clientRuntime` → `clientRuntime`. */
const receiverName = (node: ESTree.Node): string => {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  return "runtime";
};

/** A runner method read from a value that is not an Effect namespace: `runtime.runPromise`. */
const runtimeRunnerName = (node: ESTree.MemberExpression): Option.Option<string> => {
  if (node.computed || node.property.type !== "Identifier") return Option.none();
  const method = node.property.name;
  if (!effectRunners.includes(method)) return Option.none();
  return Option.some(`${receiverName(node.object)}.${method}`);
};

export const noEffectRunInTests = Rule.define({
  name: "no-effect-run-in-tests",
  meta: Rule.meta({
    type: "problem",
    description:
      "Run Effects in tests through it.effect or it.layer instead of Effect.run*, a runtime's run* methods, or ManagedRuntime.make.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (!isTestModule(ctx)) return skipFile;
    const effectNamespaces = new Set(["Effect"]);
    const managedRuntimeNamespaces = new Set(["ManagedRuntime"]);

    const runnerName = (node: ESTree.MemberExpression): Option.Option<string> => {
      const runtimes = visibleNamespaces(ctx, node, managedRuntimeNamespaces);
      if (isStaticMember(node, runtimes, "make")) return Option.some("ManagedRuntime.make");
      const effects = visibleNamespaces(ctx, node, effectNamespaces);
      const effectRunner = Arr.findFirst(effectRunners, (runner) =>
        isStaticMember(node, effects, runner),
      );
      if (Option.isSome(effectRunner)) return effectRunner;
      return runtimeRunnerName(node);
    };

    return {
      ImportDeclaration: (node: ESTree.ImportDeclaration) => {
        for (const name of importedNamespaces(node, "Effect", "effect/Effect")) {
          effectNamespaces.add(name);
        }
        for (const name of importedNamespaces(node, "ManagedRuntime", "effect/ManagedRuntime")) {
          managedRuntimeNamespaces.add(name);
        }
        return Effect.void;
      },
      MemberExpression: (node: ESTree.MemberExpression) => {
        return Option.match(runnerName(node), {
          onNone: () => Effect.void,
          onSome: (runner) =>
            ctx.report(
              Diagnostic.make({
                node,
                message: `Do not run Effects by hand in tests (${runner}). Use the test runner's Effect integration: it.effect(...) or it.layer(layer)(...) from @effect/vitest or effect-bun-test.`,
              }),
            ),
        });
      },
    };
  },
});

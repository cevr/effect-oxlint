/**
 * Run test Effects through the test runner's Effect integration, not by hand.
 *
 * Reported in test modules: the `Effect.run*` statics, `ManagedRuntime.make`,
 * and a runner method (`runPromise`, `runSync`, `runFork`, ...) on any other
 * value, such as `runtime.runPromise` or `ui.clientRuntime.runPromiseExit`,
 * whether called or passed as a reference. A computed key that names a runner
 * counts too: a string literal or template (`runtime["runPromise"]`) or a
 * const bound to one (`runtime[runPromise]`). A test's Promise edge kept in a
 * boundary file takes an override that turns this rule off there.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { type ResolveConst, constResolver } from "./_const-bindings.js";
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

/** The string a computed key spells: a string literal, a template without substitutions, or a const bound to either. */
const computedKeyText = (key: ESTree.Expression, resolve: ResolveConst): Option.Option<string> => {
  const node = resolve(key);
  if (node.type === "Literal") return Option.liftPredicate(node.value, Predicate.isString);
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return Option.fromNullishOr(node.quasis[0]?.value.cooked);
  }
  return Option.none();
};

/** The member a key reads: `runPromise` for `.runPromise`, `["runPromise"]` and `[runPromise]` with a const key. */
const memberKey = (node: ESTree.MemberExpression, resolve: ResolveConst): Option.Option<string> => {
  if (node.computed) return computedKeyText(node.property, resolve);
  if (node.property.type !== "Identifier") return Option.none();
  return Option.some(node.property.name);
};

/** A runner method read from a value that is not an Effect namespace: `runtime.runPromise`. */
const runtimeRunnerName = (
  node: ESTree.MemberExpression,
  resolve: ResolveConst,
): Option.Option<string> =>
  memberKey(node, resolve).pipe(
    Option.filter((method) => effectRunners.includes(method)),
    Option.map((method) => `${receiverName(node.object)}.${method}`),
  );

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
    const resolve = constResolver(ctx);

    const runnerName = (node: ESTree.MemberExpression): Option.Option<string> => {
      const runtimes = visibleNamespaces(ctx, node, managedRuntimeNamespaces);
      if (isStaticMember(node, runtimes, "make")) return Option.some("ManagedRuntime.make");
      const effects = visibleNamespaces(ctx, node, effectNamespaces);
      const effectRunner = Arr.findFirst(effectRunners, (runner) =>
        isStaticMember(node, effects, runner),
      );
      if (Option.isSome(effectRunner)) return effectRunner;
      return runtimeRunnerName(node, resolve);
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

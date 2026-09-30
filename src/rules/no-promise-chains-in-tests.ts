/**
 * Ban Promise-chain control flow in tests.
 *
 * A test that returns an Effect from the runner composes its steps with
 * `yield*`, its concurrency with `Effect.all`, and its cleanup with scopes. A
 * `.then`, `.catch`, or `.finally` chain steps outside that graph: a failure
 * in it escapes the Effect's error channel and its cleanup runs outside the
 * test's scope. `async`, `await`, and the Promise constructor and statics are
 * reported everywhere by `noAsyncFunction` and `noNewPromise`.
 *
 * A call on a binding imported from an Effect package, such as `Effect.catch`,
 * is a combinator and stays allowed.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isEffectPackageImport } from "./_effect-namespaces.js";
import { isTestModule, skipFile } from "./_test-files.js";

const chainMethods = new Set(["catch", "finally", "then"]);

export const noPromiseChainsInTests = Rule.define({
  name: "no-promise-chains-in-tests",
  meta: Rule.meta({
    type: "problem",
    description: "Ban `.then`, `.catch`, and `.finally` Promise chains in tests.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (!isTestModule(ctx)) return skipFile;
    const effectBindings = new Set<string>();

    return {
      ImportDeclaration: (node: ESTree.ImportDeclaration) => {
        if (!isEffectPackageImport(node)) return Effect.void;
        for (const specifier of node.specifiers) effectBindings.add(specifier.local.name);
        return Effect.void;
      },
      CallExpression: (node: ESTree.CallExpression) => {
        const callee = node.callee;
        if (
          callee.type !== "MemberExpression" ||
          callee.computed ||
          callee.property.type !== "Identifier" ||
          !chainMethods.has(callee.property.name) ||
          (callee.object.type === "Identifier" && effectBindings.has(callee.object.name))
        ) {
          return Effect.void;
        }
        return ctx.report(
          Diagnostic.make({
            node,
            message: `Avoid Promise-chain .${callee.property.name}(...) in tests. Return an Effect from the test runner: yield* each step in Effect.gen, use Effect.all for concurrency, and a scope for cleanup.`,
          }),
        );
      },
    };
  },
});

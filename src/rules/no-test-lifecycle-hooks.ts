/** Ban test lifecycle hooks in favor of Effect scopes and scoped test variants. */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { memberName, nameBindings } from "./_name-bindings.js";

const lifecycleHooks = ["afterAll", "afterEach", "beforeAll", "beforeEach"] as const;

const hookNames: ReadonlySet<string> = new Set(lifecycleHooks);

/** Specifier prefixes of the project's own modules: relative, absolute, and the usual path aliases. */
const projectPrefixes = [".", "/", "@/", "~", "#"] as const;

/**
 * A package a hook can come from (`bun:test`, `vitest`, `node:test`, `mocha`, ...):
 * any specifier that does not name one of the project's own modules, whose
 * helpers may share a hook's name.
 */
const isTestModule = (from: string): boolean =>
  !projectPrefixes.some((prefix) => from.startsWith(prefix));

export const noTestLifecycleHooks = Rule.define({
  name: "no-test-lifecycle-hooks",
  meta: Rule.meta({
    type: "problem",
    description: "Model test fixtures with Effect scopes instead of lifecycle hooks.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const bindings = nameBindings(ctx);

    /** The hook a callee calls: a test runner's hook under any import name, a global hook, or `ns.<hook>` of a runner namespace. */
    const hookOf = (callee: ESTree.Node): Option.Option<string> => {
      if (callee.type === "Identifier") {
        return Arr.findFirst(
          lifecycleHooks,
          (hook) =>
            bindings.isGlobal(callee, hook) || bindings.importsAs(callee, isTestModule, hook),
        );
      }
      if (callee.type !== "MemberExpression") return Option.none();
      if (!bindings.importsAs(callee.object, isTestModule, "*")) return Option.none();
      return Option.filter(memberName(callee), (name) => hookNames.has(name));
    };

    return {
      CallExpression: (node) => {
        if (node.type !== "CallExpression") return Effect.void;
        return Option.match(hookOf(node.callee), {
          onNone: () => Effect.void,
          onSome: (name) =>
            ctx.report(
              Diagnostic.make({
                node,
                message: `Avoid ${name}(). Use effect-bun-test scoped tests and Effect.acquireRelease for fixture lifecycles.`,
              }),
            ),
        });
      },
    };
  },
});

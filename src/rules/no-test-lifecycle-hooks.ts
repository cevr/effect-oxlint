/** Ban test lifecycle hooks in favor of Effect scopes and scoped test variants. */
import { AST, Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

const lifecycleHooks = new Set(["afterAll", "afterEach", "beforeAll", "beforeEach"]);

export const noTestLifecycleHooks = Rule.define({
  name: "no-test-lifecycle-hooks",
  meta: Rule.meta({
    type: "problem",
    description: "Model test fixtures with Effect scopes instead of lifecycle hooks.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;

    return {
      CallExpression: (node) =>
        Option.match(AST.narrow(node, "CallExpression"), {
          onNone: () => Effect.void,
          onSome: (call) => {
            const hook = Option.filter(AST.calleeName(call), (name) => lifecycleHooks.has(name));
            if (Option.isNone(hook)) return Effect.void;
            const name = hook.value;

            return ctx.report(
              Diagnostic.make({
                node: call,
                message: `Avoid ${name}(). Use effect-bun-test scoped tests and Effect.acquireRelease for fixture lifecycles.`,
              }),
            );
          },
        }),
    };
  },
});

/**
 * A promise's pending state or result is not mirrored into `useState` by
 * hand: a transition, a query or a mutation owns it.
 *
 * Reported, in a component or a custom hook:
 * - a loading flag: a function that calls one of the component's setters
 *   with `true`, then `await`s, and calls the same setter with `false`;
 * - a fetch in an effect: an effect whose callback calls a setter inside a
 *   `.then(…)` callback, or inside an async function after an `await`.
 *
 * Source: the react skill, "Never mirror a promise into `setState`" and
 * `performance.md` "useTransition over manual isLoading" (catalog SR-R05).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isTestModule, skipFile } from "./_test-files.js";
import { isFunction } from "./_anti-slop-effect.js";
import { loadingFlag, setsFromPromise } from "./_promise-state.js";
import { componentsIn, effectParts, walkComponent } from "./_react.js";
import type { Component } from "./_react.js";

/** Whether an effect's callback sets state from a promise's result. */
const fetchesIntoState = (call: ESTree.CallExpression, setters: ReadonlySet<string>): boolean =>
  Option.exists(effectParts(call), (parts) => setsFromPromise(parts.body, setters));

export const noPromiseMirroredState = Rule.define({
  name: "no-promise-mirrored-state",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Keep a promise's pending state and result in a transition, query or mutation, not in hand-set useState.",
    docs: { recommended: false, preset: "skills-react" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    const check = (component: Component) => {
      const setters = new Set(component.states.map((state) => state.setter));
      if (setters.size === 0) return Effect.void;
      const flags: Array<readonly [ESTree.Node, string]> = [];
      walkComponent(component, (node) => {
        if (isFunction(node)) Option.map(loadingFlag(node, setters), (flag) => flags.push(flag));
        return true;
      });
      const effects = component.effects.filter((call) => fetchesIntoState(call, setters));
      return Effect.andThen(
        Effect.forEach(
          flags,
          ([node, setter]) =>
            ctx.report(
              Diagnostic.make({
                node,
                message: `\`${setter}(true)\`, an \`await\` and \`${setter}(false)\` mirror a promise's pending state by hand: the flag stays true when the call throws before the reset, two calls race, and each change renders again. Use \`useTransition\` (\`const [pending, start] = useTransition()\`), or the mutation or query hook that owns the request and its pending state.`,
              }),
            ),
          { discard: true },
        ),
        Effect.forEach(
          effects,
          (call) =>
            ctx.report(
              Diagnostic.make({
                node: call,
                message:
                  "This effect copies a promise's result into state, so a slow response can overwrite a newer one, and nothing caches, dedupes or cancels the request. Read the data through a query hook (or `use()` of a cached promise) and delete the state and the effect.",
              }),
            ),
          { discard: true },
        ),
      );
    };
    return {
      Program: (program: ESTree.Program) =>
        Effect.forEach(componentsIn(program, true), check, { discard: true }),
    };
  },
});

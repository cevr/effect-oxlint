/**
 * A promise's pending state or result is not mirrored into signals by hand:
 * an async computation owns it.
 *
 * Reported, in a Solid component or a custom `create…`/`use…` primitive:
 * - a loading flag: a function that calls one of the signal setters with
 *   `true`, then `await`s, and calls the same setter with `false`;
 * - a fetch in an effect: a `createEffect` whose functions call a setter
 *   inside a `.then(…)` callback, or inside an async function after an
 *   `await`.
 * Test modules are skipped. The Solid form of `noPromiseMirroredState`.
 * Source: the react skill, "Never mirror a promise into `setState`",
 * translated by `ui/platforms/web/solid.md` (catalog SR-R05).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isFunction } from "./_anti-slop-effect.js";
import { loadingFlag, setsFromPromise } from "./_promise-state.js";
import { walkComponent } from "./_react.js";
import type { Component } from "./_react.js";
import { solidComponentsIn } from "./_solid.js";
import { isTestModule, skipFile } from "./_test-files.js";

/** Whether any function given to an effect sets a signal from a promise's result. */
const fetchesIntoSignal = (call: ESTree.CallExpression, setters: ReadonlySet<string>): boolean =>
  call.arguments.some((argument) => isFunction(argument) && setsFromPromise(argument, setters));

export const noPromiseMirroredSignal = Rule.define({
  name: "no-promise-mirrored-signal",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Keep a promise's pending state and result in an async computation (createResource, createAsync), not in hand-set signals.",
    docs: { recommended: false, preset: "skills-solid" },
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
      const effects = component.effects.filter((call) => fetchesIntoSignal(call, setters));
      return Effect.andThen(
        Effect.forEach(
          flags,
          ([node, setter]) =>
            ctx.report(
              Diagnostic.make({
                node,
                message: `\`${setter}(true)\`, an \`await\` and \`${setter}(false)\` mirror a promise's pending state by hand: the flag stays true when the call throws before the reset, and two calls race. Make the request an async computation (\`createResource\`, or Solid 2's async \`createMemo\`/\`createAsync\`) and show its pending state with \`<Loading>\` or \`isPending\`.`,
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
                  "This effect copies a promise's result into a signal, so a slow response can overwrite a newer one and nothing tracks its pending state or error. Read the data from an async computation (`createResource`, or Solid 2's async `createMemo`) and delete the signal and the effect.",
              }),
            ),
          { discard: true },
        ),
      );
    };
    return {
      Program: (program: ESTree.Program) =>
        Effect.forEach(solidComponentsIn(program, true), check, { discard: true }),
    };
  },
});

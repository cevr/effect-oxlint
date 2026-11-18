/**
 * An effect that only hands local values to a parent callback keeps the same
 * state in two places: lift it.
 *
 * Reported: a `useEffect` or `useLayoutEffect` in a component, with an inline
 * callback that is not async and a dependency list that is not empty, whose
 * body is only calls of `on…` props (`onChange(value)`, `props.onPick?.(id)`),
 * through `if` statements with no `else`. A call with no argument (a "ready"
 * signal) or one that passes a ref's `.current` (a DOM hand-off) is not
 * reported. Source: the composition skill, `state-lift-state` "Incorrect:
 * useEffect to sync state up" (catalog SR-R02).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isTestModule, skipFile } from "./_test-files.js";
import { contains } from "./_anti-slop-effect.js";
import { callOf, componentsIn, effectParts, plainExpressions, propName } from "./_react.js";
import type { Component } from "./_react.js";

const isRefCurrent = (node: ESTree.Node): boolean =>
  node.type === "MemberExpression" &&
  !node.computed &&
  node.property.type === "Identifier" &&
  node.property.name === "current";

/** The callback prop a call invokes with data, as its name. */
const syncedCallback = (call: ESTree.CallExpression, component: Component): Option.Option<string> =>
  Option.filter(propName(call.callee, component), (name) => {
    if (!/^on[A-Z]/u.test(name) || call.arguments.length === 0) return false;
    return !call.arguments.some((argument) => contains(argument, isRefCurrent));
  });

/** The callbacks an effect only calls, or none when it does anything else. */
const syncUpCallbacks = (
  call: ESTree.CallExpression,
  component: Component,
): Option.Option<ReadonlyArray<string>> =>
  Option.flatMap(effectParts(call), (parts) => {
    if (parts.deps.length === 0 || parts.callback.async) return Option.none();
    return Option.flatMap(plainExpressions(parts), (expressions) => {
      if (expressions.length === 0) return Option.none();
      const names = expressions.map((expression) =>
        Option.flatMap(callOf(expression), (inner) => syncedCallback(inner, component)),
      );
      return Option.map(Option.all(names), Arr.dedupe);
    });
  });

export const noEffectSyncUp = Rule.define({
  name: "no-effect-sync-up",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Lift state a parent needs instead of passing it up through a callback prop in an effect.",
    docs: { recommended: false, preset: "skills-react" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    const check = (component: Component) =>
      Effect.forEach(
        component.effects,
        (call) =>
          Option.match(syncUpCallbacks(call, component), {
            onNone: () => Effect.void,
            onSome: (names) => {
              const shown = names.map((name) => `\`${name}\``).join(", ");
              return ctx.report(
                Diagnostic.make({
                  node: call,
                  message: `This effect passes local state up through ${shown} after each render, so the parent keeps a copy that is one render late and the two can disagree. Lift the state: let the parent own it and pass the value and its setter down, or keep it in a provider both read. If the parent only needs the event, call ${shown} from the handler that changes the value.`,
                }),
              );
            },
          }),
        { discard: true },
      );
    return {
      Program: (program: ESTree.Program) =>
        Effect.forEach(componentsIn(program), check, { discard: true }),
    };
  },
});

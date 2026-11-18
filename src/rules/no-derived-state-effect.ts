/**
 * An effect whose body only calls the component's own state setters keeps a
 * derived value in state, or resets state when a dependency changes.
 *
 * Reported: a `useEffect` or `useLayoutEffect` in a component, with an inline
 * callback that is not async and a dependency list that is not empty, whose
 * body is only calls of the component's `useState` setters (through `if`
 * statements with no `else`). When every setter gets a constant (`""`,
 * `null`, `false`, `[]`) the effect is a reset and the message says so;
 * otherwise it derives a value. An effect that returns, declares, loops or
 * calls anything else is not reported: `react/set-state-in-effect` (oxlint)
 * is the wide form. Source: the react skill, "Compute during render, don't
 * useEffect to derive state" (catalog SR-R01).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isTestModule, skipFile } from "./_test-files.js";
import {
  calleeIdentifier,
  callOf,
  componentsIn,
  effectParts,
  isConstantValue,
  plainExpressions,
} from "./_react.js";
import type { Component } from "./_react.js";

/** The setter calls of an effect whose body is only setter calls, or none. */
const setterOnlyCalls = (
  call: ESTree.CallExpression,
  component: Component,
): Option.Option<ReadonlyArray<ESTree.CallExpression>> => {
  const setters = new Set(component.states.map((state) => state.setter));
  return Option.flatMap(effectParts(call), (parts) => {
    if (parts.deps.length === 0 || parts.callback.async) return Option.none();
    return Option.flatMap(plainExpressions(parts), (expressions) => {
      const calls = Arr.getSomes(expressions.map(callOf));
      if (calls.length === 0 || calls.length !== expressions.length) return Option.none();
      const allSetters = calls.every((setterCall) =>
        Option.exists(calleeIdentifier(setterCall), (name) => setters.has(name)),
      );
      if (!allSetters) return Option.none();
      return Option.some(calls);
    });
  });
};

const isReset = (calls: ReadonlyArray<ESTree.CallExpression>): boolean =>
  calls.every((setterCall) =>
    Option.match(Option.fromNullishOr(setterCall.arguments[0]), {
      onNone: () => true,
      onSome: isConstantValue,
    }),
  );

const setterNames = (calls: ReadonlyArray<ESTree.CallExpression>): string =>
  Arr.dedupe(Arr.getSomes(calls.map(calleeIdentifier)))
    .map((name) => `\`${name}\``)
    .join(", ");

/** The reset message when every setter gets a constant, else the derive message. */
const messageFor = (calls: ReadonlyArray<ESTree.CallExpression>): string => {
  if (isReset(calls)) {
    return `This effect resets state (${setterNames(calls)}) after a dependency changes, so the component renders once with the old value and again with the reset one. Reset it where the change happens: give the component a \`key\` that changes with the dependency, or set the state in the event handler that makes the change.`;
  }
  return `This effect only copies a value computed from props or state into state (${setterNames(calls)}), so every change renders twice and the first render shows a stale value. Compute the value during render (\`const total = …\`; \`useMemo\` only when a measurement shows it is expensive) and delete the state and the effect.`;
};

export const noDerivedStateEffect = Rule.define({
  name: "no-derived-state-effect",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Compute derived values during render and reset state where the change happens, not in an effect that only calls state setters.",
    docs: { recommended: false, preset: "skills-react" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    const check = (component: Component) =>
      Effect.forEach(
        component.effects,
        (call) =>
          Option.match(setterOnlyCalls(call, component), {
            onNone: () => Effect.void,
            onSome: (calls) =>
              ctx.report(
                Diagnostic.make({
                  node: call,
                  message: messageFor(calls),
                }),
              ),
          }),
        { discard: true },
      );
    return {
      Program: (program: ESTree.Program) =>
        Effect.forEach(componentsIn(program), check, { discard: true }),
    };
  },
});

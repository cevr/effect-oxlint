/**
 * A Solid effect does not copy a derived value into a signal.
 *
 * Reported: a `createEffect` or `createRenderEffect` in a Solid component
 * whose writing function (Solid 2's `apply`, the second argument; Solid 1's
 * only function) is not async and only calls the component's signal setters
 * (through `if` statements without `else`). The signal then holds a copy that
 * lags its source by one update; a `createMemo` (or a plain function) is the
 * value itself. An effect whose writer touches anything else (the DOM, a
 * logger, a store) is left alone. Test modules are skipped. The Solid form of
 * `noDerivedStateEffect`. Source: the react skill's "Don't useEffect to
 * derive state", `ui/platforms/web/solid.md` §2 (catalog SR-R01).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { callOf, calleeIdentifier, plainExpressions } from "./_react.js";
import type { Component } from "./_react.js";
import { effectWriter, solidComponentsIn } from "./_solid.js";
import { isTestModule, skipFile } from "./_test-files.js";

/** The setter calls of an effect whose writer is only setter calls, or none. */
const setterOnlyCalls = (
  call: ESTree.CallExpression,
  component: Component,
): Option.Option<ReadonlyArray<ESTree.CallExpression>> => {
  const setters = new Set(component.states.map((state) => state.setter));
  return Option.flatMap(effectWriter(call), (parts) => {
    if (parts.callback.async) return Option.none();
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

const setterNames = (calls: ReadonlyArray<ESTree.CallExpression>): string =>
  Arr.dedupe(Arr.getSomes(calls.map(calleeIdentifier)))
    .map((name) => `\`${name}\``)
    .join(", ");

export const noDerivedSignalEffect = Rule.define({
  name: "no-derived-signal-effect",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Derive a value with createMemo or a function, not with an effect that only calls signal setters.",
    docs: { recommended: false, preset: "skills-solid" },
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
                  message: `This effect only copies a value into a signal (${setterNames(calls)}), so the signal lags its source by one update and two owners can write it. Derive it instead (\`const count = createMemo(() => queue().length)\`, or a plain function) and delete the signal and the effect; for a reset, set the signal in the handler that makes the change.`,
                }),
              ),
          }),
        { discard: true },
      );
    return {
      Program: (program: ESTree.Program) =>
        Effect.forEach(solidComponentsIn(program), check, { discard: true }),
    };
  },
});

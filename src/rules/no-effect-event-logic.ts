/**
 * An effect that runs logic when a flag state turns true is an event handler
 * in disguise: run the logic in the handler that sets the flag.
 *
 * Reported: a `useEffect` or `useLayoutEffect` in a component whose inline
 * callback body is one `if (flag)` (or `if (flag === true)`) with no `else`,
 * where `flag` is a `useState` value of the component and is in the
 * dependency list, the `if` calls something other than the component's own
 * setters, and outside every effect the component calls the flag's setter
 * with `true` (the event). DOM work on a ref (`ref.current.focus()`) needs the
 * rendered element and is not counted as the logic. Source: the react skill, `state.md` "BAD: Effect
 * triggered by event" (catalog SR-R03).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isTestModule, skipFile } from "./_test-files.js";
import { contains, walk } from "./_anti-slop-effect.js";
import {
  calleeIdentifier,
  componentsIn,
  effectParts,
  isEffectHook,
  walkComponent,
} from "./_react.js";
import type { Component, StatePair } from "./_react.js";

/** The flag an `if` test reads: `flag` or `flag === true`. */
const flagName = (test: ESTree.Expression): Option.Option<string> => {
  if (test.type === "Identifier") return Option.some(test.name);
  if (
    test.type === "BinaryExpression" &&
    test.operator === "===" &&
    test.left.type === "Identifier" &&
    test.right.type === "Literal" &&
    test.right.value === true
  ) {
    return Option.some(test.left.name);
  }
  return Option.none();
};

/** The single `if` statement of a block callback with no `else`. */
const onlyIf = (body: ESTree.Node): Option.Option<ESTree.IfStatement> => {
  if (body.type !== "BlockStatement" || body.body.length !== 1) {
    return Option.none();
  }
  const statement = body.body[0];
  if (statement?.type !== "IfStatement") return Option.none();
  if (Option.isSome(Option.fromNullishOr(statement.alternate))) return Option.none();
  return Option.some(statement);
};

/** Whether the component sets `state` to `true` outside its effects. */
const setTrueOutsideEffects = (component: Component, state: StatePair): boolean => {
  let found = false;
  walkComponent(component, (node) => {
    if (isEffectHook(node)) return false;
    if (
      node.type === "CallExpression" &&
      Option.contains(calleeIdentifier(node), state.setter) &&
      node.arguments[0]?.type === "Literal" &&
      node.arguments[0].value === true
    ) {
      found = true;
    }
    return !found;
  });
  return found;
};

/** `ref.current.focus()`, `ref.current?.scrollIntoView()`: DOM work that needs the rendered element. */
const isRefCall = (call: ESTree.CallExpression): boolean =>
  contains(
    call.callee,
    (node) =>
      node.type === "MemberExpression" &&
      !node.computed &&
      node.property.type === "Identifier" &&
      node.property.name === "current",
  );

/** The first call in `node` that is neither one of the component's setters nor DOM work on a ref. */
const firstOtherCall = (
  node: ESTree.Node,
  setters: ReadonlySet<string>,
): Option.Option<ESTree.CallExpression> => {
  const calls: Array<ESTree.CallExpression> = [];
  walk(node, (child) => {
    if (
      child.type === "CallExpression" &&
      !isRefCall(child) &&
      !Option.exists(calleeIdentifier(child), (name) => setters.has(name))
    ) {
      calls.push(child);
    }
    return true;
  });
  return Arr.head(calls);
};

interface EventEffect {
  readonly flag: StatePair;
  readonly logic: ESTree.CallExpression;
}

const eventEffect = (
  call: ESTree.CallExpression,
  component: Component,
): Option.Option<EventEffect> =>
  Option.flatMap(effectParts(call), (parts) =>
    Option.flatMap(onlyIf(parts.body), (statement) =>
      Option.flatMap(flagName(statement.test), (name) =>
        Option.flatMap(
          Arr.findFirst(component.states, (state) => state.value === name),
          (flag) => {
            const inDeps = parts.deps.some((dep) => dep.type === "Identifier" && dep.name === name);
            if (!inDeps || !setTrueOutsideEffects(component, flag)) return Option.none();
            const setters = new Set(component.states.map((state) => state.setter));
            return Option.map(firstOtherCall(statement.consequent, setters), (logic) => ({
              flag,
              logic,
            }));
          },
        ),
      ),
    ),
  );

export const noEffectEventLogic = Rule.define({
  name: "no-effect-event-logic",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Run event logic in the handler that causes it, not in an effect that watches a flag state.",
    docs: { recommended: false, preset: "skills-react" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    const check = (component: Component) =>
      Effect.forEach(
        component.effects,
        (call) =>
          Option.match(eventEffect(call, component), {
            onNone: () => Effect.void,
            onSome: ({ flag, logic }) =>
              ctx.report(
                Diagnostic.make({
                  node: call,
                  message: `This effect runs \`${ctx.sourceCode.getText(logic.callee)}(…)\` when \`${flag.value}\` turns true, which is an event dressed as state: it runs a render late, runs again after a remount, and loses the event's data. Call it in the handler that calls \`${flag.setter}(true)\`, and drop \`${flag.value}\` if nothing else reads it.`,
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

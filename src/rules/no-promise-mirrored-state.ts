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
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isTestModule, skipFile } from "./_test-files.js";
import { isFunction, walk } from "./_anti-slop-effect.js";
import type { FunctionNode } from "./_anti-slop-effect.js";
import { calleeIdentifier, componentsIn, effectParts, walkComponent } from "./_react.js";
import type { Component } from "./_react.js";

/** The nodes of a function's body, outside nested functions. */
const ownNodes = (fn: FunctionNode): ReadonlyArray<ESTree.Node> => {
  const nodes: Array<ESTree.Node> = [];
  const body = fn.body ?? fn;
  walk(body, (node) => {
    if (node !== body && isFunction(node)) return false;
    nodes.push(node);
    return true;
  });
  return nodes;
};

/** A call of a setter in `setters` with the literal `value`. */
const setterCallWith = (
  node: ESTree.Node,
  setters: ReadonlySet<string>,
  value: boolean,
): Option.Option<string> => {
  if (node.type !== "CallExpression") return Option.none();
  const argument = node.arguments[0];
  if (argument?.type !== "Literal" || argument.value !== value) return Option.none();
  return Option.filter(calleeIdentifier(node), (name) => setters.has(name));
};

/** A loading flag in `fn`: `set(true)`, a later `await`, and `set(false)`. */
const loadingFlag = (
  fn: FunctionNode,
  setters: ReadonlySet<string>,
): Option.Option<readonly [ESTree.Node, string]> => {
  const nodes = ownNodes(fn);
  const awaits = nodes.filter((node) => node.type === "AwaitExpression");
  return Arr.findFirst(nodes, (node) =>
    Option.flatMap(setterCallWith(node, setters, true), (setter) => {
      const awaitsAfter = awaits.some((wait) => wait.start > node.start);
      const reset = nodes.some((other) =>
        Option.contains(setterCallWith(other, new Set([setter]), false), setter),
      );
      if (!awaitsAfter || !reset) return Option.none();
      return Option.some([node, setter] as const);
    }),
  );
};

const isSetterCall = (node: ESTree.Node, setters: ReadonlySet<string>): boolean =>
  node.type === "CallExpression" &&
  Option.exists(calleeIdentifier(node), (name) => setters.has(name));

/** Whether an effect's callback sets state from a promise's result. */
const fetchesIntoState = (call: ESTree.CallExpression, setters: ReadonlySet<string>): boolean =>
  Option.exists(effectParts(call), (parts) => {
    let found = false;
    walk(parts.body, (node) => {
      if (
        node.type === "CallExpression" &&
        node.callee.type === "MemberExpression" &&
        !node.callee.computed &&
        node.callee.property.type === "Identifier" &&
        node.callee.property.name === "then"
      ) {
        found ||= node.arguments.some(
          (argument) =>
            isFunction(argument) && ownNodes(argument).some((n) => isSetterCall(n, setters)),
        );
      }
      if (isFunction(node) && node.async) {
        const nodes = ownNodes(node);
        found ||= nodes.some(
          (wait) =>
            wait.type === "AwaitExpression" &&
            nodes.some((n) => isSetterCall(n, setters) && n.start > wait.start),
        );
      }
      return !found;
    });
    return found;
  });

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

/**
 * Solid components and primitives, for the skills-solid rules: a file is
 * Solid when it imports `solid-js` (or `solid-js/…`, `@solidjs/…`); a
 * component is a capitalized function that returns JSX; its signal pairs are
 * `const [value, setValue] = createSignal(initial)`; its effects are
 * `createEffect` and `createRenderEffect` calls. A Solid 2 effect is
 * `createEffect(compute, apply)` and writes in `apply`; a Solid 1 effect is
 * `createEffect(fn)` and writes in `fn`. The arity tells them apart, so no
 * `package.json` is read. The result has `_react.ts`' `Component` shape, so
 * the React rules' helpers read it unchanged.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Option from "effect/Option";

import { contains, isFunction, walk } from "./_anti-slop-effect.js";
import type { FunctionNode } from "./_anti-slop-effect.js";
import { functionName } from "./_react.js";
import type { Component, EffectParts, StatePair } from "./_react.js";

const isSolidSource = (source: string): boolean =>
  source === "solid-js" || source.startsWith("solid-js/") || source.startsWith("@solidjs/");

/** Local name → the Solid export it binds, for every named import from Solid. */
export const solidImports = (program: ESTree.Program): ReadonlyMap<string, string> => {
  const named = new Map<string, string>();
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration" || !isSolidSource(`${statement.source.value}`)) {
      continue;
    }
    for (const specifier of statement.specifiers) {
      if (specifier.type === "ImportSpecifier" && specifier.imported.type === "Identifier") {
        named.set(specifier.local.name, specifier.imported.name);
      }
    }
  }
  return named;
};

/** Whether a program imports anything from Solid. */
export const isSolidProgram = (program: ESTree.Program): boolean =>
  program.body.some(
    (statement) =>
      statement.type === "ImportDeclaration" && isSolidSource(`${statement.source.value}`),
  );

/** The Solid primitive a call invokes (`createSignal`, `createEffect`, …), through import aliases. */
export const solidPrimitive = (
  imports: ReadonlyMap<string, string>,
  call: ESTree.CallExpression,
): Option.Option<string> => {
  if (call.callee.type !== "Identifier") return Option.none();
  return Option.fromNullishOr(imports.get(call.callee.name));
};

const effectPrimitives: ReadonlySet<string> = new Set(["createEffect", "createRenderEffect"]);

const identifierAt = (pattern: ESTree.ArrayPattern, index: number) =>
  Option.flatMap(Option.fromNullishOr(pattern.elements[index]), (node) => {
    if (node.type === "Identifier") return Option.some(node.name);
    return Option.none();
  });

/** A `createSignal` declarator's pair. */
const signalPair = (
  imports: ReadonlyMap<string, string>,
  node: ESTree.Node,
): Option.Option<StatePair> => {
  if (node.type !== "VariableDeclarator" || node.id.type !== "ArrayPattern") return Option.none();
  const init = node.init;
  const isSignal =
    init?.type === "CallExpression" &&
    Option.contains(solidPrimitive(imports, init), "createSignal");
  if (!isSignal || init?.type !== "CallExpression") return Option.none();
  const pattern = node.id;
  return Option.flatMap(identifierAt(pattern, 0), (value) =>
    Option.map(identifierAt(pattern, 1), (setter) => ({
      value,
      setter,
      declarator: node,
      initial: Option.fromNullishOr(init.arguments[0]),
    })),
  );
};

/** The function an effect writes in: Solid 2's `apply` (the second argument), else Solid 1's only one. */
export const effectWriter = (call: ESTree.CallExpression): Option.Option<EffectParts> => {
  const writer = Option.fromNullishOr(call.arguments[Math.min(call.arguments.length, 2) - 1]);
  return Option.flatMap(writer, (callback) => {
    if (callback.type !== "ArrowFunctionExpression" && callback.type !== "FunctionExpression") {
      return Option.none();
    }
    return Option.map(Option.fromNullishOr(callback.body), (body) => ({
      call,
      callback,
      body,
      deps: [],
    }));
  });
};

const isJsx = (node: ESTree.Node): boolean =>
  node.type === "JSXElement" || node.type === "JSXFragment";

const isPrimitiveName = (name: string): boolean => /^(?:use|create)[A-Z]/u.test(name);

/** The Solid component (or, with `primitives`, the custom `create…`/`use…` primitive) `fn` is. */
const solidComponentOf = (
  imports: ReadonlyMap<string, string>,
  fn: FunctionNode,
  primitives: boolean,
): Option.Option<Component> =>
  Option.flatMap(functionName(fn), (name) => {
    const body = fn.body ?? fn;
    const isComponent = /^[A-Z]/u.test(name) && contains(body, isJsx);
    if (!isComponent && !(primitives && isPrimitiveName(name))) return Option.none();
    const states: Array<StatePair> = [];
    const effects: Array<ESTree.CallExpression> = [];
    walk(body, (node) => {
      const owner =
        node !== body &&
        isFunction(node) &&
        Option.exists(
          functionName(node),
          (inner) => /^[A-Z]/u.test(inner) || isPrimitiveName(inner),
        );
      if (owner) return false;
      Option.map(signalPair(imports, node), (pair) => states.push(pair));
      const isEffect =
        node.type === "CallExpression" &&
        Option.exists(solidPrimitive(imports, node), (primitive) =>
          effectPrimitives.has(primitive),
        );
      if (isEffect && node.type === "CallExpression") effects.push(node);
      return true;
    });
    const first = Option.fromNullishOr(fn.params[0]);
    return Option.some({
      fn,
      name,
      states,
      effects,
      props: new Set<string>(),
      propsName: Option.flatMap(first, (parameter) => {
        if (parameter.type === "Identifier") return Option.some(parameter.name);
        return Option.none();
      }),
    });
  });

/** Every Solid component in a program (and with `primitives`, every custom primitive); none outside a Solid file. */
export const solidComponentsIn = (
  program: ESTree.Program,
  primitives = false,
): ReadonlyArray<Component> => {
  if (!isSolidProgram(program)) return [];
  const imports = solidImports(program);
  const found: Array<Component> = [];
  walk(program, (node) => {
    if (isFunction(node)) {
      Option.map(solidComponentOf(imports, node, primitives), (component) => found.push(component));
    }
    return true;
  });
  return found;
};

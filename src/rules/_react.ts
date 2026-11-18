/**
 * React components, their state pairs and their effects, read from one file
 * with no types: what the `skills-react` rules share.
 *
 * A component is a function whose name starts with a capital letter and
 * whose body holds JSX. A state pair is `const [value, setValue] =
 * useState(…)` (or `React.useState`) anywhere in its body. An effect is a
 * `useEffect` or `useLayoutEffect` call in its body.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { contains, isFunction, unwrap, walk } from "./_anti-slop-effect.js";
import type { FunctionNode } from "./_anti-slop-effect.js";

/** A hook call's name: `useEffect(…)` or `React.useEffect(…)`. */
export const hookName = (call: ESTree.CallExpression): Option.Option<string> => {
  const callee = call.callee;
  if (callee.type === "Identifier") return Option.some(callee.name);
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.object.name === "React" &&
    callee.property.type === "Identifier"
  ) {
    return Option.some(callee.property.name);
  }
  return Option.none();
};

const effectHooks: ReadonlySet<string> = new Set(["useEffect", "useLayoutEffect"]);

/** Whether `node` is a `useEffect` or `useLayoutEffect` call. */
export const isEffectHook = (node: ESTree.Node): boolean =>
  node.type === "CallExpression" && Option.exists(hookName(node), (name) => effectHooks.has(name));

/** The name a function is declared or bound with, through wrappers such as `memo(…)`. */
export const functionName = (fn: FunctionNode): Option.Option<string> => {
  if (fn.type === "FunctionDeclaration") {
    return Option.map(Option.fromNullishOr(fn.id), (id) => id.name);
  }
  let parent: Option.Option<ESTree.Node> = Option.fromNullishOr(fn.parent);
  while (Option.isSome(parent) && parent.value.type === "CallExpression") {
    parent = Option.fromNullishOr(parent.value.parent);
  }
  return Option.flatMap(parent, (node) => {
    if (node.type === "VariableDeclarator" && node.id.type === "Identifier") {
      return Option.some(node.id.name);
    }
    return Option.none();
  });
};

/** `const [value, setValue] = useState(initial)`. */
export interface StatePair {
  readonly value: string;
  readonly setter: string;
  readonly declarator: ESTree.VariableDeclarator;
  readonly initial: Option.Option<ESTree.Node>;
}

/** A component with what the rules read from its body. */
export interface Component {
  readonly fn: FunctionNode;
  readonly name: string;
  readonly states: ReadonlyArray<StatePair>;
  readonly effects: ReadonlyArray<ESTree.CallExpression>;
  /** Names destructured from the first parameter. */
  readonly props: ReadonlySet<string>;
  /** The first parameter's name when it is a plain identifier (`props`). */
  readonly propsName: Option.Option<string>;
}

const isJsx = (node: ESTree.Node): boolean =>
  node.type === "JSXElement" || node.type === "JSXFragment";

/** The identifier name of an array pattern element. */
const elementName = (element: Option.Option<ESTree.Node>): Option.Option<string> =>
  Option.flatMap(element, (node) => {
    if (node.type === "Identifier") return Option.some(node.name);
    return Option.none();
  });

/** A `useState` declarator's pair. */
const statePair = (node: ESTree.Node): Option.Option<StatePair> => {
  if (node.type !== "VariableDeclarator" || node.id.type !== "ArrayPattern") return Option.none();
  const init = Option.map(Option.fromNullishOr(node.init), unwrap);
  if (
    !Option.exists(
      init,
      (expression) =>
        expression.type === "CallExpression" && Option.contains(hookName(expression), "useState"),
    )
  ) {
    return Option.none();
  }
  const elements = node.id.elements;
  return Option.flatMap(elementName(Option.fromNullishOr(elements[0])), (value) =>
    Option.map(elementName(Option.fromNullishOr(elements[1])), (setter) => ({
      value,
      setter,
      declarator: node,
      initial: Option.flatMap(init, (expression) => {
        if (expression.type !== "CallExpression") return Option.none();
        return Option.fromNullishOr(expression.arguments[0]);
      }),
    })),
  );
};

/** Names destructured from a parameter, `({ a, b: c })` → `a`, `c`. */
const destructuredNames = (parameter: ESTree.Node): ReadonlySet<string> => {
  const names = new Set<string>();
  const pattern = withoutDefault(parameter);
  if (pattern.type !== "ObjectPattern") return names;
  for (const property of pattern.properties) {
    if (property.type !== "Property") continue;
    const target = withoutDefault(property.value);
    if (target.type === "Identifier") names.add(target.name);
  }
  return names;
};

/** `x = fallback` → `x`. */
const withoutDefault = (node: ESTree.Node): ESTree.Node => {
  if (node.type === "AssignmentPattern") return node.left;
  return node;
};

/** Whether `name` names a custom hook: `use` and a capital letter. */
const isHookName = (name: string): boolean => /^use[A-Z]/u.test(name);

/** A nested function named as a component or a hook owns its own state and effects. */
const isOwnerName = (name: Option.Option<string>): boolean =>
  Option.exists(name, (text) => /^[A-Z]/u.test(text) || isHookName(text));

/** The component (or, with `hooks`, the custom hook) `fn` is, if it is one. */
export const componentOf = (fn: FunctionNode, hooks = false): Option.Option<Component> =>
  Option.flatMap(functionName(fn), (name) => {
    const isComponent = /^[A-Z]/u.test(name) && contains(fn.body ?? fn, isJsx);
    if (!isComponent && !(hooks && isHookName(name))) return Option.none();
    const states: Array<StatePair> = [];
    const effects: Array<ESTree.CallExpression> = [];
    const body = fn.body ?? fn;
    walk(body, (node) => {
      if (node !== body && isFunction(node) && isOwnerName(functionName(node))) return false;
      Option.map(statePair(node), (pair) => states.push(pair));
      if (node.type === "CallExpression" && isEffectHook(node)) effects.push(node);
      return true;
    });
    const first = Option.fromNullishOr(fn.params[0]);
    return Option.some({
      fn,
      name,
      states,
      effects,
      props: Option.match(first, { onNone: () => new Set<string>(), onSome: destructuredNames }),
      propsName: Option.flatMap(first, (parameter) => {
        if (parameter.type === "Identifier") return Option.some(parameter.name);
        return Option.none();
      }),
    });
  });

/** Visit a component's body, skipping nested components and hooks, which own their nodes. */
export const walkComponent = (
  component: Component,
  visit: (node: ESTree.Node) => boolean,
): void => {
  const body = component.fn.body ?? component.fn;
  walk(body, (node) => {
    if (node !== body && isFunction(node) && isOwnerName(functionName(node))) return false;
    return visit(node);
  });
};

/** Every component in a program, and with `hooks` every custom hook too. */
export const componentsIn = (program: ESTree.Program, hooks = false): ReadonlyArray<Component> => {
  const found: Array<Component> = [];
  walk(program, (node) => {
    if (isFunction(node)) {
      Option.map(componentOf(node, hooks), (component) => found.push(component));
    }
    return true;
  });
  return found;
};

/** An effect's callback and its dependency list, when both are written inline. */
export interface EffectParts {
  readonly call: ESTree.CallExpression;
  readonly callback: ESTree.ArrowFunctionExpression | ESTree.Function;
  /** The callback's body: a block, or an arrow's expression. */
  readonly body: ESTree.Node;
  readonly deps: ReadonlyArray<ESTree.Node>;
}

export const effectParts = (call: ESTree.CallExpression): Option.Option<EffectParts> => {
  const [callback, deps] = call.arguments;
  if (
    Predicate.isUndefined(callback) ||
    (callback.type !== "ArrowFunctionExpression" && callback.type !== "FunctionExpression")
  ) {
    return Option.none();
  }
  if (Predicate.isUndefined(deps) || deps.type !== "ArrayExpression") return Option.none();
  const elements = deps.elements.filter(Predicate.isNotNull);
  return Option.map(Option.fromNullishOr(callback.body), (body) => ({
    call,
    callback,
    body,
    deps: elements,
  }));
};

/**
 * The expressions a callback body runs, looking through `if` statements that
 * have no `else`. None when the body has any other statement (a declaration,
 * a `return`, a loop), so callers see only bodies made of plain calls.
 */
export const plainExpressions = (parts: EffectParts): Option.Option<ReadonlyArray<ESTree.Node>> => {
  const body = parts.body;
  if (body.type !== "BlockStatement") return Option.some([body]);
  const expressions: Array<ESTree.Node> = [];
  const collect = (statement: ESTree.Node): boolean => {
    if (statement.type === "ExpressionStatement") {
      expressions.push(statement.expression);
      return true;
    }
    if (
      statement.type === "IfStatement" &&
      Option.isNone(Option.fromNullishOr(statement.alternate))
    ) {
      if (statement.consequent.type === "BlockStatement") {
        return statement.consequent.body.every(collect);
      }
      return collect(statement.consequent);
    }
    return false;
  };
  if (!body.body.every(collect)) return Option.none();
  return Option.some(expressions);
};

/** The call an expression makes, looking through `f?.(…)`. */
export const callOf = (expression: ESTree.Node): Option.Option<ESTree.CallExpression> => {
  if (expression.type === "CallExpression") return Option.some(expression);
  if (expression.type === "ChainExpression" && expression.expression.type === "CallExpression") {
    return Option.some(expression.expression);
  }
  return Option.none();
};

/** A bare callee name: `setX(…)` → `setX`. */
export const calleeIdentifier = (call: ESTree.CallExpression): Option.Option<string> => {
  if (call.callee.type === "Identifier") return Option.some(call.callee.name);
  return Option.none();
};

/** Whether `node` is an identifier, or `props.<name>` when `propsName` is the parameter. */
export const propName = (node: ESTree.Node, component: Component): Option.Option<string> => {
  if (node.type === "Identifier" && component.props.has(node.name)) return Option.some(node.name);
  if (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.object.type === "Identifier" &&
    Option.contains(component.propsName, node.object.name) &&
    node.property.type === "Identifier"
  ) {
    return Option.some(node.property.name);
  }
  return Option.none();
};

/** A value that holds no data of the component: a literal, `undefined`, `[]`, `{}`. */
export const isConstantValue = (node: ESTree.Node): boolean => {
  if (node.type === "Literal") return true;
  if (node.type === "Identifier") return node.name === "undefined";
  if (node.type === "ArrayExpression") return node.elements.length === 0;
  if (node.type === "ObjectExpression") return node.properties.length === 0;
  if (node.type === "TemplateLiteral") return node.expressions.length === 0;
  if (node.type === "UnaryExpression") return isConstantValue(node.argument);
  return false;
};

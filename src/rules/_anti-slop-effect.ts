/**
 * Shared reading of Effect modules and Context.Service classes for the
 * Effect rules ported from K-Mistele/anti-slop (`src/effect/shared/effect-modules.ts`
 * at b7c1619, MIT, see THIRD_PARTY_NOTICES.md). Local change: absence is an
 * Option rather than null, and walks use the host's parent links.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { isAstNode } from "./_ast-children.js";

/** Effect modules whose members these rules recognize. */
export type EffectModule = "Context" | "Effect" | "Layer" | "ManagedRuntime";

const effectModules: ReadonlySet<string> = new Set([
  "Context",
  "Effect",
  "Layer",
  "ManagedRuntime",
]);

const isEffectModule = (name: string): name is EffectModule => effectModules.has(name);

/** Local names bound to each Effect module by the file's imports. */
export type EffectModuleNames = ReadonlyMap<EffectModule, ReadonlySet<string>>;

const importedName = (specifier: ESTree.ImportSpecifier): string => {
  if (specifier.imported.type === "Identifier") return specifier.imported.name;
  return specifier.imported.value;
};

/** `import { Effect } from "effect"` and `import * as Effect from "effect/Effect"` bindings. */
/** The (module, local name) pairs one import binds. */
const importBindings = (
  statement: ESTree.ImportDeclaration,
): ReadonlyArray<readonly [EffectModule, string]> => {
  const source = statement.source.value;
  if (source === "effect") {
    return statement.specifiers.flatMap(
      (specifier): ReadonlyArray<readonly [EffectModule, string]> => {
        if (specifier.type !== "ImportSpecifier") return [];
        const name = importedName(specifier);
        if (!isEffectModule(name)) return [];
        return [[name, specifier.local.name]];
      },
    );
  }
  const module = source.slice("effect/".length);
  if (!source.startsWith("effect/") || !isEffectModule(module)) return [];
  return statement.specifiers
    .filter((specifier) => specifier.type !== "ImportSpecifier")
    .map((specifier) => [module, specifier.local.name] as const);
};

export const effectModuleNames = (program: ESTree.Program): EffectModuleNames => {
  const names = new Map<EffectModule, Set<string>>();
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration") continue;
    for (const [module, local] of importBindings(statement)) {
      const existing = names.get(module) ?? new Set<string>();
      existing.add(local);
      names.set(module, existing);
    }
  }
  return names;
};

type Wrapped = Extract<
  ESTree.Node,
  {
    type:
      | "ParenthesizedExpression"
      | "TSAsExpression"
      | "TSSatisfiesExpression"
      | "TSTypeAssertion"
      | "TSNonNullExpression"
      | "TSInstantiationExpression"
      | "ChainExpression";
  }
>;

const isWrapped = (node: ESTree.Node): node is Wrapped =>
  node.type === "ParenthesizedExpression" ||
  node.type === "TSAsExpression" ||
  node.type === "TSSatisfiesExpression" ||
  node.type === "TSTypeAssertion" ||
  node.type === "TSNonNullExpression" ||
  node.type === "TSInstantiationExpression" ||
  node.type === "ChainExpression";

/** The expression under parentheses, type assertions, instantiation expressions and optional chains. */
export const unwrap = <N extends ESTree.Node>(node: N): N | ESTree.Expression => {
  let current: N | ESTree.Expression = node;
  while (isWrapped(current)) current = current.expression;
  return current;
};

/** The member name when `node` is `<module>.<member>` for one of the module's local names. */
export const moduleMember = (
  node: ESTree.Node,
  names: EffectModuleNames,
  module: EffectModule,
): Option.Option<string> => {
  const expression = unwrap(node);
  if (
    expression.type !== "MemberExpression" ||
    expression.computed ||
    expression.object.type !== "Identifier" ||
    !(names.get(module)?.has(expression.object.name) ?? false) ||
    expression.property.type !== "Identifier"
  ) {
    return Option.none();
  }
  return Option.some(expression.property.name);
};

/** The member name when `node` is a call of `<module>.<member>(...)`. */
export const moduleCall = (
  node: ESTree.Node,
  names: EffectModuleNames,
  module: EffectModule,
): Option.Option<string> => {
  const expression = unwrap(node);
  if (expression.type !== "CallExpression") return Option.none();
  return moduleMember(expression.callee, names, module);
};

/** The parts of `class X extends Context.Service<...>()("key", options) {}`. */
export interface ServiceClass {
  readonly node: ESTree.Class;
  readonly name: Option.Option<string>;
  readonly options: Option.Option<ESTree.ObjectExpression>;
}

/** A Context.Service class declaration, read. */
export const serviceClass = (
  node: ESTree.Class,
  names: EffectModuleNames,
): Option.Option<ServiceClass> =>
  Option.flatMap(Option.fromNullishOr(node.superClass), (superClass) => {
    const call = unwrap(superClass);
    if (call.type !== "CallExpression") return Option.none();
    const factory = unwrap(call.callee);
    if (factory.type !== "CallExpression") return Option.none();
    if (!Option.contains(moduleMember(factory.callee, names, "Context"), "Service")) {
      return Option.none();
    }
    const options = Option.flatMap(Option.fromUndefinedOr(call.arguments[1]), (argument) => {
      if (argument.type === "SpreadElement") return Option.none();
      const value = unwrap(argument);
      if (value.type !== "ObjectExpression") return Option.none();
      return Option.some(value);
    });
    return Option.some({
      node,
      name: Option.map(Option.fromNullishOr(node.id), (id) => id.name),
      options,
    });
  });

/** Whether `node` is a Context.Service class. */
export const isServiceClassNode = (node: ESTree.Node, names: EffectModuleNames): boolean =>
  (node.type === "ClassDeclaration" || node.type === "ClassExpression") &&
  Option.isSome(serviceClass(node, names));

/** The innermost class whose body holds `node`. */
export const enclosingClass = (node: ESTree.Node): Option.Option<ESTree.Class> => {
  for (const current of ancestorsOf(node)) {
    if (current.type !== "ClassBody") continue;
    const owner = current.parent;
    if (owner.type === "ClassDeclaration" || owner.type === "ClassExpression") {
      return Option.some(owner);
    }
    return Option.none();
  }
  return Option.none();
};

/** Whether `node` names the service class: `this` in its static members, or its class name. */
const isClassReference = (node: ESTree.Node, service: ServiceClass): boolean => {
  const expression = unwrap(node);
  if (expression.type === "ThisExpression") return true;
  return expression.type === "Identifier" && Option.contains(service.name, expression.name);
};

/** The member name when `node` is `this.<member>` or `<ClassName>.<member>`. */
export const classMember = (node: ESTree.Node, service: ServiceClass): Option.Option<string> => {
  const expression = unwrap(node);
  if (
    expression.type !== "MemberExpression" ||
    expression.computed ||
    expression.property.type !== "Identifier" ||
    !isClassReference(expression.object, service)
  ) {
    return Option.none();
  }
  return Option.some(expression.property.name);
};

/** The name of a non-computed property key. */
export const keyName = (key: ESTree.Node): Option.Option<string> => {
  if (key.type === "Identifier" || key.type === "PrivateIdentifier") return Option.some(key.name);
  if (key.type === "Literal" && Predicate.isString(key.value)) return Option.some(key.value);
  return Option.none();
};

/** The `name` property of an object expression. */
export const objectProperty = (
  object: ESTree.ObjectExpression,
  name: string,
): Option.Option<ESTree.ObjectProperty> =>
  Option.fromUndefinedOr(
    object.properties.find(
      (property): property is ESTree.ObjectProperty =>
        property.type === "Property" &&
        !property.computed &&
        Option.contains(keyName(property.key), name),
    ),
  );

/** A static class property or method, with its name. */
export interface StaticMember {
  readonly name: string;
  readonly node: ESTree.PropertyDefinition | ESTree.MethodDefinition;
  /** The property initializer or the method function. */
  readonly value: Option.Option<ESTree.Expression>;
}

/** Every non-computed static member of a class. */
export const staticMembers = (node: ESTree.Class): ReadonlyArray<StaticMember> =>
  node.body.body.flatMap((element): ReadonlyArray<StaticMember> => {
    if (element.type !== "PropertyDefinition" && element.type !== "MethodDefinition") return [];
    if (!element.static || element.computed) return [];
    return Option.toArray(
      Option.map(keyName(element.key), (name) => ({
        name,
        node: element,
        value: Option.fromNullishOr(element.value),
      })),
    );
  });

/** The expressions that construct the service: the options' `make` and a static `make`. */
export const serviceMakes = (service: ServiceClass): ReadonlyArray<ESTree.Expression> => [
  ...Option.toArray(
    Option.map(
      Option.flatMap(service.options, (options) => objectProperty(options, "make")),
      (property) => property.value,
    ),
  ),
  ...staticMembers(service.node)
    .filter((member) => member.name === "make")
    .flatMap((member) => Option.toArray(member.value)),
];

const skippedKeys: ReadonlySet<string> = new Set(["parent", "loc", "range", "start", "end"]);

const isNode = (value: unknown): value is ESTree.Node => isAstNode(value);

/** The nodes directly under `node`. */
export const childrenOf = (node: ESTree.Node): ReadonlyArray<ESTree.Node> =>
  Object.entries(node)
    .filter(([key]) => !skippedKeys.has(key))
    .flatMap(([, value]: [string, unknown]) => [value].flat())
    .filter(isNode);

/** Visit `node` and its descendants; `visit` returning false skips a node's children. */
export const walk = (node: ESTree.Node, visit: (node: ESTree.Node) => boolean): void => {
  if (!visit(node)) return;
  for (const child of childrenOf(node)) walk(child, visit);
};

/** Whether `node` or a descendant satisfies `predicate`. */
export const contains = (node: ESTree.Node, predicate: (node: ESTree.Node) => boolean): boolean =>
  predicate(node) || childrenOf(node).some((child) => contains(child, predicate));

/** A function expression, arrow or declaration. */
export type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function;

/** Whether `node` is a function expression, arrow or declaration. */
export const isFunction = (node: ESTree.Node): node is FunctionNode =>
  node.type === "ArrowFunctionExpression" ||
  node.type === "FunctionExpression" ||
  node.type === "FunctionDeclaration";

/** The nodes above `node`, nearest first. */
export function* ancestorsOf(node: ESTree.Node): Iterable<ESTree.Node> {
  let current: Option.Option<ESTree.Node> = Option.fromNullishOr(node.parent);
  while (Option.isSome(current)) {
    yield current.value;
    current = Option.fromNullishOr(current.value.parent);
  }
}

/** The return statements of a body, outside nested functions. */
export const ownReturns = (body: ESTree.Node): ReadonlyArray<ESTree.ReturnStatement> => {
  const returns: Array<ESTree.ReturnStatement> = [];
  walk(body, (node) => {
    if (node !== body && isFunction(node)) return false;
    if (node.type === "ReturnStatement") returns.push(node);
    return true;
  });
  return returns;
};

/** What a function produces: its expression body, or the arguments of its own returns. */
export const returnedExpressions = (fn: FunctionNode): ReadonlyArray<ESTree.Expression> =>
  Option.match(Option.fromNullishOr(fn.body), {
    onNone: () => [],
    onSome: (body): ReadonlyArray<ESTree.Expression> => {
      if (body.type !== "BlockStatement") return [body];
      return ownReturns(body).flatMap((statement) =>
        Option.toArray(Option.fromNullishOr(statement.argument)),
      );
    },
  });

/** For `x.pipe(...)`, the receiver `x`. */
export const pipeReceiver = (node: ESTree.Node): Option.Option<ESTree.Expression> => {
  if (node.type !== "CallExpression") return Option.none();
  const callee = unwrap(node.callee);
  if (
    callee.type !== "MemberExpression" ||
    callee.computed ||
    callee.property.type !== "Identifier" ||
    callee.property.name !== "pipe"
  ) {
    return Option.none();
  }
  return Option.some(unwrap(callee.object));
};

/**
 * The steps that run before `call` when it is an argument of a pipeline such as
 * `x.pipe(a, call)`, `pipe(x, a, call)` or `Effect.fn("name")(body, a, call)`,
 * with earlier `.pipe(...)` receivers.
 */
export const precedingSteps = (call: ESTree.Node): ReadonlyArray<ESTree.Node> => {
  const parent = call.parent;
  if (parent?.type !== "CallExpression") return [];
  const index = parent.arguments.findIndex((argument) => argument === call);
  if (index < 0) return [];
  const steps: Array<ESTree.Node> = [];
  let receiver = pipeReceiver(parent);
  while (Option.isSome(receiver)) {
    const value = receiver.value;
    steps.push(value);
    if (value.type === "CallExpression") steps.push(...value.arguments);
    receiver = pipeReceiver(value);
  }
  steps.push(...parent.arguments.slice(0, index));
  return steps;
};

/** The generator passed to `Effect.gen(...)`. */
export const genFunction = (
  node: ESTree.Node,
  names: EffectModuleNames,
): Option.Option<ESTree.Function> => {
  if (node.type !== "CallExpression") return Option.none();
  if (!Option.contains(moduleCall(node, names, "Effect"), "gen")) return Option.none();
  const body = node.arguments.at(-1);
  if (body?.type !== "FunctionExpression") return Option.none();
  return Option.some(body);
};

/**
 * The generator that builds a service from a make expression:
 * `Effect.gen(function* () {...})`, with any `.pipe(...)`, or an arrow returning one.
 */
export const makeGenerator = (
  make: ESTree.Expression,
  names: EffectModuleNames,
): Option.Option<ESTree.Function> => {
  let expression = unwrap(make);
  if (expression.type === "ArrowFunctionExpression" || expression.type === "FunctionExpression") {
    const returned = returnedExpressions(expression).at(0);
    if (!returned) return Option.none();
    expression = unwrap(returned);
  }
  let receiver = pipeReceiver(expression);
  while (Option.isSome(receiver)) {
    expression = receiver.value;
    receiver = pipeReceiver(expression);
  }
  return genFunction(expression, names);
};

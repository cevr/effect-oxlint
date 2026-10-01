/**
 * What a read of a global holds, followed through the code that passes it on.
 *
 * A rule names the globals it watches and how it treats each use. The walk
 * starts at each read of a watched name, or of the global object
 * (`globalThis`, `self`, `window`, `global`), that no binding shadows, and
 * follows the value through static and computed string members
 * (`globalThis["Promise"]`), `as`/`!`/`satisfies`/`?.` wrappers, `const`
 * and `let` aliases, and object destructures, nested ones too. An alias is
 * followed only while every write to it stores the same value, and a cycle
 * of aliases ends. `typeof` probes and type positions are not uses.
 *
 * At each use the rule's handler decides: a member read, a call, a `new`, a
 * rest element, or an escape (an argument, a return, any other spot the walk
 * cannot see past).
 */
import type { ESTree, Reference, Variable } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";

import { AST, Scope } from "../vendor/effect-oxlint/index.js";
import type { RuleContext, Visitor } from "../vendor/effect-oxlint/index.js";

/**
 * What a followed value holds: the global object, a watched global by name
 * (`process`, `Promise`), or a value a rule names for one of its members
 * (`crypto.subtle`, `Promise.all`).
 */
export type Held = string;

/** The global object, whatever name reads it. */
export const globalObject: Held = "globalThis";

const globalObjects = new Set(["globalThis", "self", "window", "global"]);

/** What a read of a global's own name holds: `self` is the global object, `fetch` is `fetch`. */
const heldByName = (name: string): Held => {
  if (globalObjects.has(name)) return globalObject;
  return name;
};

/** How a rule treats each use of a value it watches. */
export interface GlobalUses {
  /** The global names whose reads start a walk. */
  readonly names: ReadonlySet<string>;
  /**
   * The value `owner.name` holds, when the walk follows the member on. A
   * member of the global object is always the global of that name; any
   * other member with no value here is reported through `member`.
   */
  readonly memberValue: (owner: Held, name: string) => Option.Option<Held>;
  /** A read of `owner.name` at `node`: a member expression or a destructured property. */
  readonly member: (node: ESTree.Node, owner: Held, name: string) => Effect.Effect<void>;
  readonly call: (node: ESTree.CallExpression, held: Held) => Effect.Effect<void>;
  readonly construct: (node: ESTree.NewExpression, held: Held) => Effect.Effect<void>;
  /** `const { ...rest } = held`: `follow` walks on with `rest` holding `held`. */
  readonly rest: (
    node: ESTree.Node,
    held: Held,
    follow: Effect.Effect<void>,
  ) => Effect.Effect<void>;
  /** A value that leaves the walk's sight at `node`. */
  readonly escape: (node: ESTree.Node, held: Held) => Effect.Effect<void>;
}

/** The wrappers that keep their operand's value: `x as T`, `x!`, `x satisfies T`, `a?.b`. */
const transparentWrappers = new Set([
  "ChainExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
]);

/** The outermost node reached from `node` through wrappers that keep its value. */
const climbTransparent = (node: ESTree.Node): ESTree.Node => {
  let current = node;
  while (
    Predicate.isNotNullish(current.parent) &&
    (transparentWrappers.has(current.parent.type) ||
      current.parent.type === "ParenthesizedExpression")
  ) {
    current = current.parent;
  }
  return current;
};

/** The expression inside the wrappers that keep its value. */
const unwrapTransparent = (node: ESTree.Node): ESTree.Node => {
  if (
    node.type === "ChainExpression" ||
    node.type === "ParenthesizedExpression" ||
    node.type === "TSAsExpression" ||
    node.type === "TSNonNullExpression" ||
    node.type === "TSSatisfiesExpression" ||
    node.type === "TSTypeAssertion"
  ) {
    return unwrapTransparent(node.expression);
  }
  return node;
};

/** A member's name when it is static: `a.b`, `a["b"]`, or a template with no substitution. */
export const staticMemberName = (member: ESTree.MemberExpression): Option.Option<string> => {
  const property = member.property;
  if (!member.computed && property.type === "Identifier") return Option.some(property.name);
  if (property.type === "Literal" && Predicate.isString(property.value)) {
    return Option.some(property.value);
  }
  if (property.type === "TemplateLiteral" && property.expressions.length === 0) {
    return Option.fromNullishOr(property.quasis[0]?.value.cooked);
  }
  return Option.none();
};

const propertyKeyName = (
  property: ESTree.ObjectPattern["properties"][number],
): Option.Option<string> => {
  if (property.type === "RestElement") return Option.none();
  if (!property.computed && property.key.type === "Identifier") {
    return Option.some(property.key.name);
  }
  if (property.key.type === "Literal" && Predicate.isString(property.key.value)) {
    return Option.some(property.key.value);
  }
  return Option.none();
};

const isTypePosition = (node: ESTree.Node): boolean =>
  node.type === "TSTypeQuery" || node.type === "TSQualifiedName";

/** `typeof x`: a capability probe, not a use. */
const isTypeofOperand = (parent: ESTree.Node): boolean =>
  parent.type === "UnaryExpression" && parent.operator === "typeof";

/**
 * Whether an Identifier is a name rather than a read: a static member's
 * property, an object key, or a declaration's own name.
 */
const isNameNotRead = (node: ESTree.Node, parent: ESTree.Node): boolean => {
  if (parent.type === "MemberExpression") return parent.property === node && !parent.computed;
  if (parent.type === "Property") {
    return parent.key === node && !parent.computed && !parent.shorthand;
  }
  if (parent.type === "VariableDeclarator") return parent.id === node;
  return (
    parent.type === "TSPropertySignature" ||
    parent.type === "MethodDefinition" ||
    parent.type === "PropertyDefinition" ||
    parent.type === "LabeledStatement" ||
    parent.type === "BreakStatement" ||
    parent.type === "ContinueStatement" ||
    parent.type === "ImportSpecifier" ||
    parent.type === "ExportSpecifier"
  );
};

/**
 * What a write stores: a known value, nothing the walk can name, or only the
 * variables already being evaluated (an alias cycle, which adds no value).
 */
const Stored = Schema.TaggedUnion({
  Known: { held: Schema.String },
  Unknown: {},
  Cycle: {},
});
type Stored = typeof Stored.Type;

const unknown: Stored = Stored.cases.Unknown.make({});
const cycle: Stored = Stored.cases.Cycle.make({});
const known = (held: Held): Stored => Stored.cases.Known.make({ held });

/** A write the walk can read: `const x = value`, `let x = value` or `x = value`. */
const isPlainWrite = (reference: Reference): boolean => {
  const target = reference.identifier;
  const parent = target.parent;
  return (
    (parent?.type === "VariableDeclarator" && parent.id === target) ||
    (parent?.type === "AssignmentExpression" && parent.left === target && parent.operator === "=")
  );
};

/** The `Identifier` visitor that walks each read of a watched global. */
export const globalValueVisitor = (
  ctx: RuleContext["Service"],
  uses: GlobalUses,
): Visitor.EffectVisitor => {
  const memberValue = (owner: Held, name: string): Option.Option<Held> => {
    if (owner === globalObject) return Option.some(name);
    return uses.memberValue(owner, name);
  };

  /** What `expression` stores, evaluating each variable in `evaluating` as a cycle. */
  const storedBy = (expression: ESTree.Node, evaluating: ReadonlySet<Variable>): Stored => {
    const value = unwrapTransparent(expression);
    if (value.type === "MemberExpression") {
      const owner = storedBy(value.object, evaluating);
      // A member of a cyclic owner is a new value, not the alias again.
      if (owner._tag !== "Known") return unknown;
      return Option.match(
        Option.flatMap(staticMemberName(value), (name) => memberValue(owner.held, name)),
        { onNone: () => unknown, onSome: known },
      );
    }
    if (value.type !== "Identifier") return unknown;
    return Option.match(Scope.findVariableUp(ctx.sourceCode.getScope(value), value.name), {
      onNone: () => known(heldByName(value.name)),
      onSome: (variable) => {
        if (variable.defs.length === 0) return known(heldByName(value.name));
        if (evaluating.has(variable)) return cycle;
        return storedInto(variable, new Set([...evaluating, variable]), () => false);
      },
    });
  };

  /**
   * What every write to `variable` stores, past the `trusted` writes: one
   * known value when the writes agree, a cycle when they only alias back.
   */
  const storedInto = (
    variable: Variable,
    evaluating: ReadonlySet<Variable>,
    trusted: (reference: Reference) => boolean,
  ): Stored => {
    let stored: Stored = cycle;
    for (const reference of variable.references) {
      if (!reference.isWrite() || trusted(reference)) continue;
      if (!isPlainWrite(reference) || Predicate.isNull(reference.writeExpr)) return unknown;
      const written = storedBy(reference.writeExpr, evaluating);
      if (written._tag === "Unknown") return unknown;
      if (written._tag === "Known") {
        if (stored._tag === "Known" && stored.held !== written.held) return unknown;
        stored = written;
      }
    }
    return stored;
  };

  /** The variables already followed with each value: an alias cycle ends at a second visit. */
  const followed = new Map<Variable, Set<Held>>();

  /**
   * Follows every read of the variables a declaration binds inside
   * `within`, while every other write to the variable stores `held`.
   */
  const followDeclared = (
    declarator: ESTree.VariableDeclarator,
    within: ESTree.Node,
    held: Held,
  ): Effect.Effect<void> => {
    const inside = (node: ESTree.Node) => node.start >= within.start && node.end <= within.end;
    return Effect.forEach(
      ctx.sourceCode
        .getDeclaredVariables(declarator)
        .filter((variable) => variable.identifiers.some(inside)),
      (variable) => {
        const seen = followed.get(variable) ?? new Set<Held>();
        if (seen.has(held)) return Effect.void;
        followed.set(variable, seen.add(held));
        const others = storedInto(
          variable,
          new Set([variable]),
          (reference) => reference.init && inside(reference.identifier),
        );
        if (others._tag === "Unknown" || (others._tag === "Known" && others.held !== held)) {
          return Effect.void;
        }
        return Effect.forEach(
          variable.references.filter((reference) => !reference.init && reference.isRead()),
          (reference) => inspect(reference.identifier, held),
          { discard: true },
        );
      },
      { discard: true },
    );
  };

  /** `owner.name` read at `node`: followed on with its value, or handed to the rule. */
  const readMember = (
    node: ESTree.Node,
    owner: Held,
    name: string,
    next: (held: Held) => Effect.Effect<void>,
  ): Effect.Effect<void> =>
    Option.match(memberValue(owner, name), {
      onNone: () => uses.member(node, owner, name),
      onSome: next,
    });

  /** A property's binding: a nested pattern walks on with the member's value. */
  const bindMember = (
    declarator: ESTree.VariableDeclarator,
    property: ESTree.Node,
    binding: ESTree.BindingPattern,
    member: Held,
  ): Effect.Effect<void> => {
    if (binding.type === "AssignmentPattern") {
      return bindMember(declarator, property, binding.left, member);
    }
    if (binding.type === "ObjectPattern") return inspectDestructure(declarator, binding, member);
    return followDeclared(declarator, property, member);
  };

  /** `const { a, "b": c, d: { e }, ...rest } = held`. */
  const inspectDestructure = (
    declarator: ESTree.VariableDeclarator,
    pattern: ESTree.ObjectPattern,
    held: Held,
  ): Effect.Effect<void> =>
    Effect.forEach(
      pattern.properties,
      (property) => {
        if (property.type === "RestElement") {
          if (held === globalObject) return Effect.void;
          return uses.rest(property, held, followDeclared(declarator, property, held));
        }
        return Option.match(propertyKeyName(property), {
          onNone: () => uses.escape(property, held),
          onSome: (name) =>
            readMember(property, held, name, (member) =>
              bindMember(declarator, property, property.value, member),
            ),
        });
      },
      { discard: true },
    );

  /** Hands the rule what the read of `held` at `node` does with it. */
  const inspect = (node: ESTree.Node, held: Held): Effect.Effect<void> => {
    const value = climbTransparent(node);
    const parent = value.parent;
    if (Predicate.isNullish(parent) || isTypePosition(parent) || isTypeofOperand(parent)) {
      return Effect.void;
    }
    if (parent.type === "MemberExpression" && parent.object === value) {
      return Option.match(staticMemberName(parent), {
        onNone: () => uses.escape(parent, held),
        onSome: (name) => readMember(parent, held, name, (member) => inspect(parent, member)),
      });
    }
    if (parent.type === "CallExpression" && parent.callee === value) return uses.call(parent, held);
    if (parent.type === "NewExpression" && parent.callee === value) {
      return uses.construct(parent, held);
    }
    if (parent.type === "VariableDeclarator" && parent.init === value) {
      if (parent.id.type === "Identifier") return followDeclared(parent, parent.id, held);
      if (parent.id.type === "ObjectPattern") return inspectDestructure(parent, parent.id, held);
    }
    return uses.escape(value, held);
  };

  /** A read of a watched global by its own name, not shadowed by any binding in scope. */
  const isGlobalRead = (node: ESTree.Node & { readonly name: string }): boolean => {
    if (!uses.names.has(node.name) && !globalObjects.has(node.name)) return false;
    const parent = node.parent;
    if (Predicate.isNullish(parent) || isNameNotRead(node, parent)) return false;
    if (parent.type.startsWith("TS") && !transparentWrappers.has(parent.type)) return false;
    return Option.match(Scope.findVariableUp(ctx.sourceCode.getScope(node), node.name), {
      onNone: () => true,
      onSome: (variable) => variable.defs.length === 0,
    });
  };

  return {
    Identifier: (node) =>
      Option.match(Option.filter(AST.narrow(node, "Identifier"), isGlobalRead), {
        onNone: () => Effect.void,
        onSome: (identifier) => inspect(identifier, heldByName(identifier.name)),
      }),
  };
};

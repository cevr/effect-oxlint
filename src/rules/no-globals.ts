/**
 * Ban ambient runtime capabilities that have direct Effect replacements.
 *
 * The rule starts at each read of a global that no binding shadows and
 * follows the value: through the global object (`globalThis`, `self`,
 * `window`, `global`), static and computed string members (`process["env"]`),
 * `as`/`!`/`satisfies`/`?.` wrappers, and each alias or destructure
 * (`const { env } = process`, `const D = Date; new D()`), nested ones too,
 * while every write to the alias stores the same global. A value that leaves
 * its sight (an argument, a return) is a use only of a global the `members`
 * option bans whole. `typeof` probes and type positions are not uses.
 *
 * The `members` option bans more members of a global, on top of the built-in
 * list: `{ "Bun": { "use": "an Effect platform service" } }` bans every
 * member of `Bun`, and `{ "process": { "properties": ["cwd", "pid"], "use":
 * "..." } }` bans the listed ones. A project exempts its adapter files with
 * an override that turns the rule off, or configures it without the option to
 * keep only the built-in list there.
 */
import type { ESTree, Reference, Variable } from "@oxlint/plugins";
import { AST, Diagnostic, Rule, RuleContext, Scope } from "../vendor/effect-oxlint/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";

const MemberOption = Schema.Struct({
  properties: Schema.optionalKey(Schema.Array(Schema.String)),
  use: Schema.String,
});

const Options = Schema.UndefinedOr(
  Schema.Struct({
    members: Schema.optionalKey(Schema.Record(Schema.String, MemberOption)),
  }),
);

type MemberBan = readonly [object: string, properties: ReadonlySet<string>, alternative: string];

const memberBans: ReadonlyArray<MemberBan> = [
  [
    "console",
    new Set(["debug", "error", "info", "log", "trace", "warn"]),
    "Effect logging or Console",
  ],
  ["Date", new Set(["now"]), "Clock or DateTime"],
  ["Math", new Set(["random"]), "Random"],
  ["performance", new Set(["now"]), "Clock.currentTimeNanos"],
  ["crypto", new Set(["getRandomValues", "randomUUID"]), "Crypto"],
  ["JSON", new Set(["parse", "stringify"]), "Schema JSON codecs"],
  [
    "process",
    new Set(["argv", "chdir", "env", "exit", "hrtime", "nextTick", "stderr", "stdin", "stdout"]),
    "Config, Stdio, Clock, or Effect scheduling",
  ],
  [
    "Bun",
    new Set([
      "$",
      "Glob",
      "connect",
      "env",
      "file",
      "listen",
      "nanoseconds",
      "randomUUIDv7",
      "redis",
      "serve",
      "sleep",
      "spawn",
      "spawnSync",
      "stderr",
      "stdin",
      "stdout",
      "write",
    ]),
    "the corresponding Effect platform service",
  ],
  [
    "Deno",
    new Set([
      "args",
      "env",
      "exit",
      "mkdir",
      "open",
      "readDir",
      "readFile",
      "readTextFile",
      "remove",
      "serve",
      "stat",
      "stderr",
      "stdin",
      "stdout",
      "writeFile",
      "writeTextFile",
    ]),
    "the corresponding Effect platform service",
  ],
  ["localStorage", new Set(["clear", "getItem", "key", "removeItem", "setItem"]), "KeyValueStore"],
  [
    "sessionStorage",
    new Set(["clear", "getItem", "key", "removeItem", "setItem"]),
    "KeyValueStore",
  ],
];

const callBans = new Map([
  ["atob", "Encoding.decodeBase64"],
  ["btoa", "Encoding.encodeBase64"],
  ["fetch", "HttpClient"],
  ["queueMicrotask", "Effect scheduling"],
  ["setImmediate", "Effect scheduling"],
  ["setInterval", "Effect.sleep with Schedule"],
  ["setTimeout", "Effect.sleep or Schedule"],
]);

const constructorBans = new Map([
  ["Date", "Clock or DateTime"],
  ["SharedWorker", "Effect Worker"],
  ["WebSocket", "Socket"],
  ["Worker", "Effect Worker"],
]);

/** The names that read the global object: `globalThis.fetch` is `fetch`. */
const globalObjects = new Set(["globalThis", "self", "window", "global"]);

/**
 * What a followed value holds: the global object, the Web Crypto `subtle`
 * object, or else the global of that name (`process`, `Date`, `fetch`).
 */
type Held = string;
const globalObject: Held = "globalThis";
const cryptoSubtle: Held = "crypto.subtle";

const processStreams = new Set(["stderr", "stdin", "stdout"]);

/** The wrappers that keep their operand's value: `x as T`, `x!`, `x satisfies T`, `a?.b`. */
const transparentWrappers = new Set([
  "ChainExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
]);

/** What a read of a global's own name holds: `self` is the global object, `fetch` is `fetch`. */
const heldByName = (name: string): Held => {
  if (globalObjects.has(name)) return globalObject;
  return name;
};

/** The outermost node reached from `node` through wrappers that keep its value. */
const climbTransparent = (node: ESTree.Node): ESTree.Node => {
  let current = node;
  while (Predicate.isNotNullish(current.parent) && transparentWrappers.has(current.parent.type)) {
    current = current.parent;
  }
  return current;
};

/** The expression inside the wrappers that keep its value. */
const unwrapTransparent = (node: ESTree.Node): ESTree.Node => {
  if (
    node.type === "ChainExpression" ||
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
const staticMemberName = (member: ESTree.MemberExpression): Option.Option<string> => {
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
  if (parent.type === "Property")
    return parent.key === node && !parent.computed && !parent.shorthand;
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

// No Effect service exposes TTY detection, so capability probes stay allowed
// while every operational use of the streams remains banned.
const isTtyRead = (node: ESTree.MemberExpression): boolean => {
  const parent = node.parent;
  if (parent?.type !== "MemberExpression" || parent.computed) return false;
  return (
    parent.object === node &&
    parent.property.type === "Identifier" &&
    parent.property.name === "isTTY"
  );
};

export const noGlobals = Rule.define({
  name: "no-globals",
  meta: Rule.meta({
    type: "problem",
    description: "Avoid ambient runtime capabilities that Effect provides as services.",
    schema: [
      {
        type: "object",
        properties: {
          members: {
            type: "object",
            additionalProperties: {
              type: "object",
              properties: {
                properties: { type: "array", items: { type: "string" } },
                use: { type: "string" },
              },
              required: ["use"],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ members: {} }],
  }),
  options: Options,
  create: function* (options) {
    const ctx = yield* RuleContext;
    const configuredMembers = new Map(Object.entries(options?.members ?? {}));
    /** The replacement a configured ban names for `object.property`, if one applies. */
    const configuredBan = (object: string, property: string): Option.Option<string> =>
      Option.flatMap(Option.fromUndefinedOr(configuredMembers.get(object)), (ban) =>
        Option.liftPredicate(ban.use, () =>
          Option.match(Option.fromUndefinedOr(ban.properties), {
            onNone: () => true,
            onSome: (listed) => listed.includes(property),
          }),
        ),
      );
    /** A global every member of which the configuration bans: `{ "Bun": { "use": "..." } }`. */
    const wholeBan = (name: string): Option.Option<string> =>
      Option.flatMap(Option.fromUndefinedOr(configuredMembers.get(name)), (ban) =>
        Option.liftPredicate(ban.use, () => Predicate.isUndefined(ban.properties)),
      );
    /** The replacement for `object.property`: the built-in list first, then the configuration. */
    const memberBan = (object: string, property: string): Option.Option<string> => {
      for (const [bannedObject, properties, alternative] of memberBans) {
        if (object === bannedObject && properties.has(property)) return Option.some(alternative);
      }
      return configuredBan(object, property);
    };
    const candidates = new Set([
      ...globalObjects,
      ...memberBans.map(([object]) => object),
      ...callBans.keys(),
      ...constructorBans.keys(),
      ...configuredMembers.keys(),
    ]);

    const report = (node: ESTree.Node, used: string, alternative: string) =>
      ctx.report(
        Diagnostic.make({
          node,
          message: `Avoid ${used}. Use ${alternative}; platform adapters may disable this rule explicitly.`,
        }),
      );

    /** A value that leaves the rule's sight is a use only of a wholly banned global. */
    const reportEscape = (node: ESTree.Node, held: Held): Effect.Effect<void> =>
      Option.match(wholeBan(held), {
        onNone: () => Effect.void,
        onSome: (alternative) => report(node, held, alternative),
      });

    /**
     * Whether `expression` stores `held`, assuming each variable in
     * `assuming` holds it: the global itself, a member of the global object,
     * or a variable every write to which stores it.
     */
    const stores = (
      expression: ESTree.Node,
      held: Held,
      assuming: ReadonlySet<Variable>,
    ): boolean => {
      const value = unwrapTransparent(expression);
      if (value.type === "MemberExpression") {
        return Option.match(staticMemberName(value), {
          onNone: () => false,
          onSome: (name) => {
            if (name === held) return stores(value.object, globalObject, assuming);
            return (
              held === cryptoSubtle && name === "subtle" && stores(value.object, "crypto", assuming)
            );
          },
        });
      }
      if (value.type !== "Identifier") return false;
      return Option.match(Scope.findVariableUp(ctx.sourceCode.getScope(value), value.name), {
        onNone: () => heldByName(value.name) === held,
        onSome: (variable) => {
          if (variable.defs.length === 0) return heldByName(value.name) === held;
          return everyWriteStores(variable, held, assuming, () => false);
        },
      });
    };

    /**
     * Whether every write to `variable` stores `held`. `trusted` names the
     * writes already known to store it; a write through any other pattern,
     * or of any other value, ends the alias.
     */
    const everyWriteStores = (
      variable: Variable,
      held: Held,
      assuming: ReadonlySet<Variable>,
      trusted: (reference: Reference) => boolean,
    ): boolean => {
      if (assuming.has(variable)) return true;
      const next = new Set([...assuming, variable]);
      return variable.references.every((reference) => {
        if (!reference.isWrite() || trusted(reference)) return true;
        const target = reference.identifier;
        const parent = target.parent;
        const plainWrite =
          (parent?.type === "VariableDeclarator" && parent.id === target) ||
          (parent?.type === "AssignmentExpression" &&
            parent.left === target &&
            parent.operator === "=");
        return (
          plainWrite &&
          Predicate.isNotNull(reference.writeExpr) &&
          stores(reference.writeExpr, held, next)
        );
      });
    };

    /** The variables already followed with each value: an alias cycle ends at a second visit. */
    const followed = new Map<Variable, Set<Held>>();

    /**
     * Follows every read of the variables a declaration binds inside
     * `within`, while every write to the variable stores `held`.
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
          if (
            !everyWriteStores(
              variable,
              held,
              new Set(),
              (reference) => reference.init && inside(reference.identifier),
            )
          ) {
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

    /**
     * What `held.name` is: the global a global-object member names, the
     * Web Crypto `subtle` object, or a banned member reported at `node`.
     */
    const readMember = (
      node: ESTree.Node,
      held: Held,
      name: string,
      next: (held: Held) => Effect.Effect<void>,
      ttyRead: boolean,
    ): Effect.Effect<void> => {
      if (held === globalObject) return next(name);
      if (held === cryptoSubtle) {
        if (name === "digest") return report(node, "crypto.subtle.digest", "Crypto.digest");
        return Effect.void;
      }
      if (held === "crypto" && name === "subtle") return next(cryptoSubtle);
      return Option.match(memberBan(held, name), {
        onNone: () => Effect.void,
        onSome: (alternative) => {
          if (held === "process" && processStreams.has(name) && ttyRead) return Effect.void;
          return report(node, `${held}.${name}`, alternative);
        },
      });
    };

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
            return Option.match(wholeBan(held), {
              onNone: () => followDeclared(declarator, property, held),
              onSome: (alternative) => report(property, `...${held}`, alternative),
            });
          }
          return Option.match(propertyKeyName(property), {
            onNone: () => reportEscape(property, held),
            onSome: (name) =>
              readMember(
                property,
                held,
                name,
                (member) => bindMember(declarator, property, property.value, member),
                false,
              ),
          });
        },
        { discard: true },
      );

    /** Reports what the read of `held` at `node` does with it. */
    const inspect = (node: ESTree.Node, held: Held): Effect.Effect<void> => {
      const value = climbTransparent(node);
      const parent = value.parent;
      if (Predicate.isNullish(parent) || isTypePosition(parent) || isTypeofOperand(parent)) {
        return Effect.void;
      }
      if (parent.type === "MemberExpression" && parent.object === value) {
        return Option.match(staticMemberName(parent), {
          onNone: () => reportEscape(parent, held),
          onSome: (name) =>
            readMember(parent, held, name, (member) => inspect(parent, member), isTtyRead(parent)),
        });
      }
      if (parent.type === "CallExpression" && parent.callee === value) {
        return Option.match(Option.fromUndefinedOr(callBans.get(held)), {
          onNone: () => reportEscape(parent, held),
          onSome: (alternative) => report(parent, `${held}()`, alternative),
        });
      }
      if (parent.type === "NewExpression" && parent.callee === value) {
        return Option.match(Option.fromUndefinedOr(constructorBans.get(held)), {
          onNone: () => reportEscape(parent, held),
          onSome: (alternative) => report(parent, `new ${held}()`, alternative),
        });
      }
      if (parent.type === "VariableDeclarator" && parent.init === value) {
        if (parent.id.type === "Identifier") return followDeclared(parent, parent.id, held);
        if (parent.id.type === "ObjectPattern") return inspectDestructure(parent, parent.id, held);
      }
      return reportEscape(value, held);
    };

    /** A read of a global by its own name, not shadowed by any binding in scope. */
    const isGlobalRead = (node: ESTree.Node & { readonly name: string }): boolean => {
      if (!candidates.has(node.name)) return false;
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
  },
});

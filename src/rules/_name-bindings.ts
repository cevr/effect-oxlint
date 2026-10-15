/**
 * What a name is bound to where it is read: an import (its module and the
 * name it takes there), a global (a name the file binds nowhere), or a
 * `const` that takes it apart from a value (`const { spawnSync } = Bun`).
 * Each read goes through the file's scope tree, so a parameter or a local of
 * the same spelling is its own binding.
 */
import type { Definition, ESTree } from "@oxlint/plugins";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { Scope } from "../vendor/effect-oxlint/index.js";
import type { RuleContext } from "../vendor/effect-oxlint/index.js";

/** A name, where it is read. */
type Named = ESTree.Node & { readonly name: string };

/** A module, told by its specifier as written (`effect`, `effect/process`, `bun:test`). */
export type Module = (from: string) => boolean;

/** What an import binds: its module, and the name it takes there (`*` the module whole, `default`). */
interface Imported {
  readonly from: string;
  readonly name: string;
}

/** The name a key spells: `name`, `"name"`, or `` [`name`] ``. */
const staticKey = (key: ESTree.Node, computed: boolean): Option.Option<string> => {
  if (!computed && key.type === "Identifier") return Option.some(key.name);
  if (key.type === "Literal" && Predicate.isString(key.value)) return Option.some(key.value);
  if (computed && key.type === "TemplateLiteral" && key.expressions.length === 0)
    return Option.fromNullishOr(key.quasis[0]?.value.cooked);
  return Option.none();
};

/** The name a member expression reads: `a.name`, `a["name"]`, or `` a[`name`] ``. */
export const memberName = (node: ESTree.MemberExpression): Option.Option<string> =>
  staticKey(node.property, node.computed);

/** The bindings of the linted file, each read where the name is written. */
export interface NameBindings {
  /** How a name is bound: its first definition, none for a name the file binds nowhere. */
  readonly definitionOf: (id: Named) => Option.Option<Definition>;
  /** Whether `node` is a name bound to the import of `name` (`*` the module whole) from a module `from` accepts. */
  readonly importsAs: (node: ESTree.Node, from: Module, name: string) => boolean;
  /** Whether `node` is the global `name`: written so, and bound nowhere where it is read. */
  readonly isGlobal: (node: ESTree.Node, name: string) => boolean;
  /** The key a name is taken apart under and the value it is taken from: `const { key: id } = value`. */
  readonly takenFrom: (
    id: Named,
  ) => Option.Option<{ readonly key: string; readonly value: ESTree.Node }>;
}

export const nameBindings = (ctx: RuleContext["Service"]): NameBindings => {
  const definitionOf = (id: Named): Option.Option<Definition> =>
    Option.flatMap(Scope.findVariableUp(ctx.sourceCode.getScope(id), id.name), (variable) =>
      Option.fromUndefinedOr(variable.defs[0]),
    );

  const importOf = (id: Named): Option.Option<Imported> =>
    Option.flatMap(definitionOf(id), (definition) => {
      const declaration = definition.parent;
      if (definition.type !== "ImportBinding" || declaration?.type !== "ImportDeclaration")
        return Option.none();
      const from = String(declaration.source.value);
      const specifier = definition.node;
      if (specifier.type === "ImportNamespaceSpecifier") return Option.some({ from, name: "*" });
      if (specifier.type === "ImportDefaultSpecifier")
        return Option.some({ from, name: "default" });
      if (specifier.type !== "ImportSpecifier") return Option.none();
      return Option.map(staticKey(specifier.imported, false), (name) => ({ from, name }));
    });

  const importsAs = (node: ESTree.Node, from: Module, name: string): boolean =>
    node.type === "Identifier" &&
    Option.exists(importOf(node), (imported) => from(imported.from) && imported.name === name);

  const isGlobal = (node: ESTree.Node, name: string): boolean =>
    node.type === "Identifier" && node.name === name && Option.isNone(definitionOf(node));

  const takenFrom = (id: Named) =>
    Option.flatMap(definitionOf(id), (definition) => {
      const declarator = definition.node;
      if (
        definition.type !== "Variable" ||
        declarator.type !== "VariableDeclarator" ||
        declarator.parent.type !== "VariableDeclaration" ||
        declarator.parent.kind !== "const" ||
        !declarator.init
      )
        return Option.none();
      const value = declarator.init;
      const property = definition.name.parent;
      if (property?.type !== "Property" || property.value !== definition.name) return Option.none();
      if (property.parent !== declarator.id) return Option.none();
      return Option.map(staticKey(property.key, property.computed), (key) => ({ key, value }));
    });

  return { definitionOf, importsAs, isGlobal, takenFrom };
};

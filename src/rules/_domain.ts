/**
 * The building blocks of an `@alchemy.run/domain` model, for the skills-domain
 * rules: a call `Domain.Aggregate(…)` with `Domain` imported from the package
 * (as a namespace or a default), or `Aggregate(…)` imported from it by name.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";

const domainPackage = "@alchemy.run/domain";

export interface DomainImports {
  /** Local names bound to the whole package: `import * as Domain`, `import Domain`. */
  readonly namespaces: ReadonlySet<string>;
  /** Local name → the package's export it binds: `import { Aggregate as Agg }` → Agg → Aggregate. */
  readonly named: ReadonlyMap<string, string>;
}

/** What a program imports from `@alchemy.run/domain`. */
export const domainImports = (program: ESTree.Program): DomainImports => {
  const namespaces = new Set<string>();
  const named = new Map<string, string>();
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration" || statement.source.value !== domainPackage)
      continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type !== "ImportSpecifier") {
        namespaces.add(specifier.local.name);
      } else if (specifier.imported.type === "Identifier") {
        named.set(specifier.local.name, specifier.imported.name);
      }
    }
  }
  return { namespaces, named };
};

/** The building block a call declares (`Aggregate`, `View`, `Event`, …), if it is one. */
export const buildingBlockOf = (
  imports: DomainImports,
  call: ESTree.CallExpression,
): Option.Option<string> => {
  const callee = call.callee;
  if (callee.type === "Identifier") return Option.fromNullishOr(imports.named.get(callee.name));
  const isMember =
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    imports.namespaces.has(callee.object.name) &&
    callee.property.type === "Identifier";
  if (!isMember) return Option.none();
  return Option.some(callee.property.name);
};

/** The handlers of a section (`decide`, `evolve`, `reply`) in a building block's options object. */
export const sectionOf = (
  call: ESTree.CallExpression,
  section: string,
): ReadonlyArray<ESTree.Node> => {
  const options = Arr.findFirst(call.arguments, (argument) => argument.type === "ObjectExpression");
  return Option.match(options, {
    onNone: () => [],
    onSome: (object) => {
      if (object.type !== "ObjectExpression") return [];
      return object.properties.flatMap((property) => {
        const matches =
          property.type === "Property" &&
          !property.computed &&
          property.key.type === "Identifier" &&
          property.key.name === section &&
          property.value.type === "ObjectExpression";
        if (!matches || property.value.type !== "ObjectExpression") return [];
        return property.value.properties.flatMap((handler) => {
          if (handler.type !== "Property") return [];
          return [handler.value];
        });
      });
    },
  });
};

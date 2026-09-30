/**
 * Provide platform layers only in the entry files a project names.
 *
 * A module that provides `BunFileSystem.layer` (or any `layer*` export of a
 * platform package) builds its own copy of a service the process entry
 * already provides, so a test host's services never reach it. Code outside
 * the entry yields the service (`FileSystem`, `Path`, `Crypto`, ...) instead.
 *
 * The rule follows every binding a file takes from a platform package, static
 * or `import()`, and each `const` alias or destructure of it. It reports:
 *
 * - a `layer*` member of a platform module, through a module binding, a
 *   package namespace (`Platform.BunFileSystem.layer`), a destructure, or a
 *   named import from a module path (`import { layer } from ".../BunPath"`);
 * - a platform module or package value that leaves the rule's sight: passed
 *   to a function, put in an array or object, returned, read through a
 *   computed member it cannot name, or exported;
 * - a re-export from a platform package.
 *
 * Other members (`BunRuntime.runMain`, `BunSocket.makeNet`) and type
 * positions are not provisions. The `packages` option lists the platform
 * packages (default: the `@effect/platform-*` runtimes), and `layers` names
 * a project's own platform layers, reported wherever they are imported or
 * read as a member. Test modules are skipped. The entry files turn the rule
 * off with an override; a layer no entry can provide keeps a line
 * suppression that gives its reason.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isTestModule, skipFile } from "./_test-files.js";

const Options = Schema.UndefinedOr(
  Schema.Struct({
    packages: Schema.optionalKey(Schema.Array(Schema.String)),
    layers: Schema.optionalKey(Schema.Array(Schema.String)),
  }),
);

const defaultPackages = [
  "@effect/platform-browser",
  "@effect/platform-bun",
  "@effect/platform-node",
  "@effect/platform-node-shared",
];

/** A package binding holds modules; a module binding holds layers. */
type Holder = "package" | "module";

const layerExport = /^layer/u;

const transparentWrappers = new Set([
  "AwaitExpression",
  "ChainExpression",
  "TSAsExpression",
  "TSNonNullExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
]);

/** The outermost node reached from `node` through wrappers that keep its value. */
const climbTransparent = (node: ESTree.Node): ESTree.Node => {
  let current = node;
  while (Predicate.isNotNullish(current.parent) && transparentWrappers.has(current.parent.type)) {
    current = current.parent;
  }
  return current;
};

/** A member's name when it is static: `a.b` or `a["b"]`. */
const staticMemberName = (member: ESTree.MemberExpression): Option.Option<string> => {
  if (!member.computed && member.property.type === "Identifier") {
    return Option.some(member.property.name);
  }
  if (member.property.type === "Literal" && Predicate.isString(member.property.value)) {
    return Option.some(member.property.value);
  }
  return Option.none();
};

const propertyKeyName = (key: ESTree.PropertyKey): Option.Option<string> => {
  if (key.type === "Identifier") return Option.some(key.name);
  if (key.type === "Literal" && Predicate.isString(key.value)) return Option.some(key.value);
  return Option.none();
};

const exportName = (name: ESTree.ModuleExportName): string => {
  if (name.type === "Literal") return String(name.value);
  return name.name;
};

const isTypePosition = (node: ESTree.Node): boolean =>
  node.type === "TSTypeQuery" || node.type === "TSQualifiedName";

const provisionMessage = (text: string): string =>
  `\`${text}\` provides a platform layer outside the platform entry files. Yield the service the entry provides; a layer no entry can provide keeps a line suppression that gives its reason.`;

const escapeMessage = (text: string): string =>
  `\`${text}\` hands a platform module on, where its layers can no longer be followed. Read the member you need here, or yield the service the entry provides.`;

const reExportMessage = (source: string): string =>
  `Re-exporting '${source}' hands its layers to every importer. Import the package where it is used, or yield the service the entry provides.`;

export const noPlatformLayerOutsideEntry = Rule.define({
  name: "no-platform-layer-outside-entry",
  meta: Rule.meta({
    type: "problem",
    description: "Provide platform layers only in the entry files a project names.",
    docs: { recommended: false },
    schema: [
      {
        type: "object",
        properties: {
          packages: { type: "array", items: { type: "string" } },
          layers: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ packages: defaultPackages, layers: [] }],
  }),
  options: Options,
  create: function* (options) {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    const packages = options?.packages ?? defaultPackages;
    const layerNames = new Set(options?.layers ?? []);
    const report = (node: ESTree.Node, message: string) =>
      ctx.report(Diagnostic.make({ node, message }));

    /** What a module specifier holds, when it names a platform package or one of its modules. */
    const holderOf = (source: string): Option.Option<Holder> => {
      if (packages.includes(source)) return Option.some("package");
      if (packages.some((name) => source.startsWith(`${name}/`))) return Option.some("module");
      return Option.none();
    };

    /**
     * Follows every read of the variables a declaration binds, or only those
     * bound inside `within` (one property of a destructure).
     */
    const followDeclared = (
      declaration: ESTree.Node,
      holder: Holder,
      label: (variableName: string) => string,
      within: ESTree.Node = declaration,
    ): Effect.Effect<void> =>
      Effect.forEach(
        ctx.sourceCode
          .getDeclaredVariables(declaration)
          .filter((variable) =>
            variable.identifiers.some(
              (identifier) => identifier.start >= within.start && identifier.end <= within.end,
            ),
          ),
        (variable) =>
          Effect.forEach(
            variable.references.filter((reference) => !reference.init),
            (reference) => inspect(reference.identifier, holder, label(variable.name)),
            { discard: true },
          ),
        { discard: true },
      );

    const inspectMember = (
      member: ESTree.MemberExpression,
      holder: Holder,
      label: string,
    ): Effect.Effect<void> =>
      Option.match(staticMemberName(member), {
        onNone: () => report(member, escapeMessage(`${label}[...]`)),
        onSome: (name) => {
          if (holder === "package") return inspect(member, "module", `${label}.${name}`);
          if (layerExport.test(name)) return report(member, provisionMessage(`${label}.${name}`));
          return Effect.void;
        },
      });

    /** `const { a, b: c } = platformValue`: modules from a package, layers from a module. */
    const inspectDestructure = (
      declarator: ESTree.VariableDeclarator,
      pattern: ESTree.ObjectPattern,
      holder: Holder,
      label: string,
    ): Effect.Effect<void> =>
      Effect.forEach(
        pattern.properties,
        (property) => {
          if (property.type === "RestElement") {
            return report(property, escapeMessage(`...${label}`));
          }
          return Option.match(propertyKeyName(property.key), {
            onNone: () => report(property, escapeMessage(`${label}[...]`)),
            onSome: (name) => {
              if (holder === "module") {
                if (!layerExport.test(name)) return Effect.void;
                return report(property, provisionMessage(`${label}.${name}`));
              }
              return followDeclared(declarator, "module", () => `${label}.${name}`, property);
            },
          });
        },
        { discard: true },
      );

    const inspectDeclarator = (
      declarator: ESTree.VariableDeclarator,
      holder: Holder,
      label: string,
    ): Effect.Effect<void> => {
      if (declarator.id.type === "Identifier") {
        return followDeclared(declarator, holder, (name) => name);
      }
      if (declarator.id.type === "ObjectPattern") {
        return inspectDestructure(declarator, declarator.id, holder, label);
      }
      return report(declarator, escapeMessage(label));
    };

    /** Reports what the use of a platform package or module value at `node` does with it. */
    const inspect = (node: ESTree.Node, holder: Holder, label: string): Effect.Effect<void> => {
      const value = climbTransparent(node);
      const parent = value.parent;
      if (Predicate.isNullish(parent) || isTypePosition(parent)) return Effect.void;
      if (parent.type === "MemberExpression" && parent.object === value) {
        return inspectMember(parent, holder, label);
      }
      if (parent.type === "VariableDeclarator" && parent.init === value) {
        return inspectDeclarator(parent, holder, label);
      }
      return report(value, escapeMessage(label));
    };

    const inspectSpecifier = (
      specifier: ESTree.ImportDeclaration["specifiers"][number],
      holder: Holder,
      source: string,
    ): Effect.Effect<void> => {
      if (specifier.type !== "ImportSpecifier") {
        return followDeclared(specifier, holder, (name) => name);
      }
      if (specifier.importKind === "type") return Effect.void;
      if (holder === "package") return followDeclared(specifier, "module", (name) => name);
      const imported = exportName(specifier.imported);
      if (!layerExport.test(imported)) return Effect.void;
      const module = Option.getOrElse(Arr.last(source.split("/")), () => source);
      return report(specifier, provisionMessage(`${module}.${imported}`));
    };

    const reportNamedLayers = (declaration: ESTree.ImportDeclaration): Effect.Effect<void> =>
      Effect.forEach(
        declaration.specifiers,
        (specifier) => {
          if (specifier.type !== "ImportSpecifier") return Effect.void;
          const imported = exportName(specifier.imported);
          if (!layerNames.has(imported)) return Effect.void;
          return report(specifier, provisionMessage(imported));
        },
        { discard: true },
      );

    const reportReExport = (
      node: ESTree.ExportNamedDeclaration | ESTree.ExportAllDeclaration,
    ): Effect.Effect<void> => {
      if (Predicate.isNullish(node.source) || node.exportKind === "type") return Effect.void;
      const source = node.source.value;
      if (Option.isNone(holderOf(source))) return Effect.void;
      return report(node, reExportMessage(source));
    };

    return {
      ImportDeclaration: (node: ESTree.ImportDeclaration) => {
        if (node.importKind === "type") return Effect.void;
        const source = node.source.value;
        return Option.match(holderOf(source), {
          onNone: () => reportNamedLayers(node),
          onSome: (holder) =>
            Effect.forEach(
              node.specifiers,
              (specifier) => inspectSpecifier(specifier, holder, source),
              { discard: true },
            ),
        });
      },
      ImportExpression: (node: ESTree.ImportExpression) => {
        if (node.source.type !== "Literal" || !Predicate.isString(node.source.value)) {
          return Effect.void;
        }
        const source = node.source.value;
        return Option.match(holderOf(source), {
          onNone: () => Effect.void,
          onSome: (holder) => inspect(node, holder, `import("${source}")`),
        });
      },
      ExportNamedDeclaration: reportReExport,
      ExportAllDeclaration: reportReExport,
      MemberExpression: (node: ESTree.MemberExpression) =>
        Option.match(
          Option.filter(staticMemberName(node), (name) => layerNames.has(name)),
          {
            onNone: () => Effect.void,
            onSome: (name) => report(node, provisionMessage(name)),
          },
        ),
    };
  },
});

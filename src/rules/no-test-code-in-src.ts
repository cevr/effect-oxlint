/**
 * Test code stays out of production source directories. Opt-in: the layout
 * (which directories are source, which are tests) is a project's policy.
 *
 * Reported, in a file under a source directory (default `src`): the file
 * itself when it is a test or spec file or sits in a test directory below it;
 * an import or re-export from a test directory (default `test`, `tests`,
 * `__tests__`); and an export or static member whose name reads as test code
 * (`layerTest`, `FakeStore`, `makeMockClient`, ...). Ported from
 * K-Mistele/anti-slop (`no-test-code-in-src`, b7c1619, MIT;
 * THIRD_PARTY_NOTICES.md).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { keyName } from "./_anti-slop-effect.js";
import { isTestFile, skipFile } from "./_test-files.js";

const defaultSourceDirectories = ["src"];
const defaultTestDirectories = ["test", "tests", "__tests__"];
const defaultTestNamePatterns = [
  "^layer(?:Test|Fake|Mock|Stub)",
  "(?:Test|Fake|Mock|Stub)Layer$",
  "^(?:Fake|Mock|Stub)[A-Z]",
  "[a-z0-9](?:Fake|Mock|Stub)$",
  "^(?:make|create)(?:Test|Fake|Mock|Stub)[A-Z]",
];

const NoTestCodeInSrcOptions = Schema.UndefinedOr(
  Schema.Struct({
    sourceDirectories: Schema.optionalKey(Schema.Array(Schema.String)),
    testDirectories: Schema.optionalKey(Schema.Array(Schema.String)),
    testNamePatterns: Schema.optionalKey(Schema.Array(Schema.String)),
  }),
);

const stringListSchema = {
  type: "array",
  items: { type: "string", minLength: 1 },
  uniqueItems: true,
} as const;

const exportedName = (node: ESTree.ModuleExportName): string => {
  if (node.type === "Literal") return node.value;
  return node.name;
};

type Named = ESTree.BindingIdentifier;

/** The names a local export declaration binds. */
const declaredNames = (declaration: ESTree.Declaration): ReadonlyArray<Named> => {
  if (declaration.type === "VariableDeclaration") {
    return declaration.declarations.flatMap((declarator): ReadonlyArray<Named> => {
      if (declarator.id.type !== "Identifier") return [];
      return [declarator.id];
    });
  }
  if (
    declaration.type === "FunctionDeclaration" ||
    declaration.type === "ClassDeclaration" ||
    declaration.type === "TSTypeAliasDeclaration" ||
    declaration.type === "TSInterfaceDeclaration" ||
    declaration.type === "TSEnumDeclaration"
  ) {
    return Option.toArray(Option.fromNullishOr(declaration.id));
  }
  return [];
};

export const noTestCodeInSrc = Rule.define({
  name: "no-test-code-in-src",
  meta: Rule.meta({
    type: "problem",
    description:
      "Disallow test files, imports from test directories, and test-named exports such as `layerTest` inside production source directories.",
    docs: { recommended: false },
    schema: [
      {
        type: "object",
        properties: {
          sourceDirectories: stringListSchema,
          testDirectories: stringListSchema,
          testNamePatterns: stringListSchema,
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [
      {
        sourceDirectories: defaultSourceDirectories,
        testDirectories: defaultTestDirectories,
        testNamePatterns: defaultTestNamePatterns,
      },
    ],
  }),
  options: NoTestCodeInSrcOptions,
  create: function* (options) {
    const ctx = yield* RuleContext;
    const sourceDirectories = new Set(options?.sourceDirectories ?? defaultSourceDirectories);
    const testDirectories = new Set(options?.testDirectories ?? defaultTestDirectories);
    const testNamePatterns = (options?.testNamePatterns ?? defaultTestNamePatterns).map(
      (pattern) => new RegExp(pattern, "u"),
    );
    const segments = ctx.filename.replaceAll("\\", "/").split("/");
    const sourceIndex = segments.findIndex((segment) => sourceDirectories.has(segment));
    if (sourceIndex < 0) return skipFile;
    const sourceDirectory = segments[sourceIndex] ?? "src";

    const report = (node: ESTree.Node, message: string) =>
      ctx.report(Diagnostic.make({ node, message }));

    const reportName = (node: ESTree.Node, name: string) => {
      if (!testNamePatterns.some((pattern) => pattern.test(name))) return Effect.void;
      return report(
        node,
        `\`${name}\` is test code in production source, where it ships with the package. Move it to the package's test/ directory (shared helpers in test/support/) and build test layers there from the production class, e.g. \`Service.layer.pipe(Layer.provide(Layer.succeed(Dep, Dep.of({ ... }))))\`.`,
      );
    };

    const checkSource = (source: ESTree.Node) => {
      if (source.type !== "Literal" || !Predicate.isString(source.value)) return Effect.void;
      const path = source.value;
      if (!path.startsWith("./") && !path.startsWith("../")) return Effect.void;
      if (!path.split("/").some((segment) => testDirectories.has(segment))) return Effect.void;
      return report(
        source,
        `Production source imports \`${path}\` from a test directory, so it depends on test code. Move what it needs into source, or move this module to test/.`,
      );
    };

    const checkStaticMember = (node: ESTree.PropertyDefinition | ESTree.MethodDefinition) => {
      if (!node.static || node.computed) return Effect.void;
      if (node.key.type !== "Identifier" && node.key.type !== "PrivateIdentifier") {
        return Effect.void;
      }
      return Option.match(keyName(node.key), {
        onNone: () => Effect.void,
        onSome: (name) => reportName(node.key, name),
      });
    };

    return {
      Program: (node: ESTree.Program) => {
        const inTestDirectory = segments
          .slice(sourceIndex + 1, -1)
          .some((segment) => testDirectories.has(segment));
        if (!isTestFile(ctx.filename) && !inTestDirectory) return Effect.void;
        return report(
          node,
          `This test file lives in production source (\`${sourceDirectory}/\`), where it ships with the package. Move it to the package's test/ directory, with shared helpers in test/support/.`,
        );
      },
      ImportDeclaration: (node: ESTree.ImportDeclaration) => checkSource(node.source),
      ImportExpression: (node: ESTree.ImportExpression) => checkSource(node.source),
      ExportAllDeclaration: (node: ESTree.ExportAllDeclaration) => checkSource(node.source),
      ExportNamedDeclaration: (node: ESTree.ExportNamedDeclaration) =>
        Effect.andThen(
          Option.match(Option.fromNullishOr(node.source), {
            onNone: () => Effect.void,
            onSome: checkSource,
          }),
          Effect.forEach(
            [
              ...Option.toArray(Option.fromNullishOr(node.declaration)).flatMap((declaration) =>
                declaredNames(declaration).map(
                  (identifier) => [identifier, identifier.name] as const,
                ),
              ),
              ...node.specifiers.map(
                (specifier) => [specifier, exportedName(specifier.exported)] as const,
              ),
            ],
            ([target, name]) => reportName(target, name),
            { discard: true },
          ),
        ),
      PropertyDefinition: checkStaticMember,
      MethodDefinition: checkStaticMember,
    };
  },
});

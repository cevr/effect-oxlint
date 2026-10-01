/**
 * A test's temp directory lives in the system temp directory, not the repo.
 *
 * A temp directory under the repo that a killed test leaves behind is linted,
 * formatted and scanned as if it were source, and two runs of the suite share
 * it. Reported in test code (`*.test.*`, `*.spec.*` and the `effect.testFiles`
 * setting):
 *
 * - a temp directory call (`mkdtemp`, `mkdtempSync`, `makeTempDirectory`,
 *   `makeTempDirectoryScoped`, on any receiver) whose argument is a repo
 *   path, or whose options object (inline or held in a binding) gives a repo
 *   path or a relative `directory` literal;
 * - a node `mkdtemp`/`mkdtempSync` whose prefix is a relative literal
 *   (`mkdtempSync("case-")` creates the directory in the working directory);
 * - a repo path joined to a `tmp` or `temp` segment (`.tmp`, `tmp-x`,
 *   `temp`), in a `join`/`resolve` call or a template literal.
 *
 * A repo path is `import.meta.dir`, `import.meta.dirname`, `__dirname`,
 * `process.cwd()`, a `join`/`resolve` call whose first argument is a relative
 * path literal (it starts with a word character or `.`) or whose arguments
 * hold a repo path, a template or `+` concatenation that holds one, or a
 * `const`/`let` bound to one.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { AST, Diagnostic, Rule, RuleContext, Scope } from "../vendor/effect-oxlint/index.js";
import { staticMemberName } from "./_global-values.js";
import { isTestModule, skipFile } from "./_test-files.js";

const tempCalls = new Set([
  "makeTempDirectory",
  "makeTempDirectoryScoped",
  "mkdtemp",
  "mkdtempSync",
]);
const nodeTempCalls = new Set(["mkdtemp", "mkdtempSync"]);
const pathCalls = new Set(["join", "resolve"]);

/** A path segment that names a temp directory: `tmp`, `.tmp`, `temp`, `tmp-x`, `temp_fixtures`. */
const tmpSegment = /^\.?(?:tmp|temp)(?:[-_.].*)?$/iu;

const message =
  "A test temp directory under the repo is linted and scanned as source when a killed test leaves it behind, and parallel runs share it. Create it in the system temp directory: makeTempDirectoryScoped without `directory`.";

const unwrap = (node: ESTree.Node): ESTree.Node => {
  if (
    node.type === "ParenthesizedExpression" ||
    node.type === "TSAsExpression" ||
    node.type === "TSNonNullExpression" ||
    node.type === "TSSatisfiesExpression" ||
    node.type === "TSTypeAssertion"
  ) {
    return unwrap(node.expression);
  }
  return node;
};

/** The name a call reads: `join` in `join(...)` and `path.join(...)`. */
const calleeName = (node: ESTree.CallExpression): Option.Option<string> => {
  const callee = unwrap(node.callee);
  if (callee.type === "Identifier") return Option.some(callee.name);
  if (callee.type === "MemberExpression") return staticMemberName(callee);
  return Option.none();
};

const isImportMetaDirectory = (node: ESTree.Node): boolean =>
  node.type === "MemberExpression" &&
  node.object.type === "MetaProperty" &&
  node.object.meta.name === "import" &&
  Option.exists(staticMemberName(node), (name) => name === "dir" || name === "dirname");

const isProcessCwd = (node: ESTree.CallExpression): boolean => {
  const callee = unwrap(node.callee);
  return (
    callee.type === "MemberExpression" &&
    callee.object.type === "Identifier" &&
    callee.object.name === "process" &&
    Option.exists(staticMemberName(callee), (name) => name === "cwd")
  );
};

/** The literal text a path argument starts with: a string, or a template's first chunk. */
const leadingText = (node: ESTree.Node): Option.Option<string> => {
  const value = unwrap(node);
  if (value.type === "Literal" && Predicate.isString(value.value)) return Option.some(value.value);
  if (value.type === "TemplateLiteral") {
    return Option.fromNullishOr(value.quasis[0]?.value.cooked);
  }
  return Option.none();
};

/** A relative path literal that starts a path segment: `"fixtures"`, `"./x"`, `"../.."`. */
const isRelativePathLiteral = (node: ESTree.Node): boolean =>
  Option.exists(leadingText(node), (text) => /^[\w.]/u.test(text));

/** A prefix or directory literal that is not absolute: none of `/`, `$`, `~` starts it. */
const isRelativeLiteral = (node: ESTree.Node): boolean =>
  Option.exists(leadingText(node), (text) => text.length > 0 && !/^[/$~]/u.test(text));

/** Every string chunk an expression spells: string arguments, template chunks. */
const literalTexts = (node: ESTree.Node): ReadonlyArray<string> => {
  const value = unwrap(node);
  if (value.type === "Literal" && Predicate.isString(value.value)) return [value.value];
  if (value.type === "TemplateLiteral") {
    return value.quasis.flatMap((quasi) =>
      Option.toArray(Option.fromNullishOr(quasi.value.cooked)),
    );
  }
  return [];
};

const hasTmpSegment = (text: string): boolean =>
  text.split("/").some((segment) => tmpSegment.test(segment));

/** `directory:` or `"directory":`, the option that roots a temp directory. */
const isDirectoryKey = (property: ESTree.ObjectProperty): boolean =>
  !property.computed &&
  ((property.key.type === "Identifier" && property.key.name === "directory") ||
    (property.key.type === "Literal" && property.key.value === "directory"));

const isExpressionArgument = (argument: ESTree.Argument): argument is ESTree.Expression =>
  argument.type !== "SpreadElement";

export const noRepoTempDirectory = Rule.define({
  name: "no-repo-temp-directory",
  meta: Rule.meta({
    type: "problem",
    description: "Create a test's temp directory in the system temp directory, not under the repo.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (!isTestModule(ctx)) return skipFile;

    /** The initializer of a `const`/`let` written once, at its declaration. */
    const boundValue = (
      node: ESTree.Node & { readonly name: string },
    ): Option.Option<ESTree.Expression> =>
      Option.flatMap(Scope.findVariableUp(ctx.sourceCode.getScope(node), node.name), (variable) => {
        const definition = variable.defs[0];
        if (variable.defs.length !== 1 || definition?.node.type !== "VariableDeclarator") {
          return Option.none();
        }
        if (variable.references.filter((reference) => reference.isWrite()).length > 1) {
          return Option.none();
        }
        return Option.fromNullishOr(definition.node.init);
      });

    /** A name no binding in scope declares: the CommonJS `__dirname`, not a local. */
    const isUnboundName = (node: ESTree.Node & { readonly name: string }): boolean =>
      Option.match(Scope.findVariableUp(ctx.sourceCode.getScope(node), node.name), {
        onNone: () => true,
        onSome: (variable) => variable.defs.length === 0,
      });

    const isRepoPathWith = (node: ESTree.Node, seen: ReadonlySet<ESTree.Node>): boolean => {
      const value = unwrap(node);
      if (seen.has(value)) return false;
      const next = new Set([...seen, value]);
      if (isImportMetaDirectory(value)) return true;
      if (value.type === "Identifier") {
        if (value.name === "__dirname" && isUnboundName(value)) return true;
        return Option.exists(boundValue(value), (init) => isRepoPathWith(init, next));
      }
      if (value.type === "TemplateLiteral") {
        return value.expressions.some((expression) => isRepoPathWith(expression, next));
      }
      if (value.type === "BinaryExpression" && value.operator === "+") {
        return isRepoPathWith(value.left, next) || isRepoPathWith(value.right, next);
      }
      if (value.type !== "CallExpression") return false;
      if (isProcessCwd(value)) return true;
      if (!Option.exists(calleeName(value), (name) => pathCalls.has(name))) return false;
      const args = value.arguments.filter(isExpressionArgument);
      const first = args[0];
      if (Predicate.isNotUndefined(first) && isRelativePathLiteral(first)) return true;
      return args.some((argument) => isRepoPathWith(argument, next));
    };
    const isRepoPath = (node: ESTree.Node): boolean => isRepoPathWith(node, new Set());

    /** The object an options argument holds, inline or through a binding. */
    const optionsObject = (node: ESTree.Node): Option.Option<ESTree.ObjectExpression> => {
      const value = unwrap(node);
      if (value.type === "ObjectExpression") return Option.some(value);
      if (value.type === "Identifier") {
        return Option.flatMap(boundValue(value), (init) =>
          AST.narrow(unwrap(init), "ObjectExpression"),
        );
      }
      return Option.none();
    };

    /** The node in a temp call's argument that roots the directory in the repo. */
    const repoArgument = (argument: ESTree.Expression): Option.Option<ESTree.Node> => {
      if (isRepoPath(argument)) return Option.some(argument);
      return Option.flatMap(optionsObject(argument), (options) => {
        const hit = options.properties.find(
          (property) =>
            property.type === "Property" &&
            ((isDirectoryKey(property) && isRelativeLiteral(property.value)) ||
              isRepoPath(property.value)),
        );
        if (Predicate.isUndefined(hit)) return Option.none();
        // An inline object reports its property; a bound one, the argument that passes it.
        if (unwrap(argument).type === "ObjectExpression") return Option.some(hit);
        return Option.some(argument);
      });
    };

    const reported = new Set<number>();
    const report = (node: ESTree.Node): Effect.Effect<void> => {
      if (reported.has(node.start)) return Effect.void;
      reported.add(node.start);
      return ctx.report(Diagnostic.make({ node, message }));
    };

    const checkTempCall = (node: ESTree.CallExpression, name: string): Effect.Effect<void> => {
      const args = node.arguments.filter(isExpressionArgument);
      const first = args[0];
      if (nodeTempCalls.has(name) && Predicate.isNotUndefined(first) && isRelativeLiteral(first)) {
        return report(node);
      }
      for (const argument of args) {
        const hit = repoArgument(argument);
        if (Option.isSome(hit)) return report(hit.value);
      }
      return Effect.void;
    };

    /** A repo path joined to a temp segment: `join(import.meta.dir, ".tmp")`. */
    const joinsTmpSegment = (parts: ReadonlyArray<ESTree.Node>): boolean =>
      parts.some((part) => literalTexts(part).some(hasTmpSegment));

    return {
      CallExpression: (node: ESTree.CallExpression) =>
        Option.match(calleeName(node), {
          onNone: () => Effect.void,
          onSome: (name) => {
            if (tempCalls.has(name)) return checkTempCall(node, name);
            if (pathCalls.has(name) && isRepoPath(node) && joinsTmpSegment(node.arguments)) {
              return report(node);
            }
            return Effect.void;
          },
        }),
      TemplateLiteral: (node: ESTree.TemplateLiteral) => {
        if (
          !isRepoPath(node) ||
          !node.quasis.some((quasi) => hasTmpSegment(quasi.value.cooked ?? ""))
        ) {
          return Effect.void;
        }
        return report(node);
      },
    };
  },
});

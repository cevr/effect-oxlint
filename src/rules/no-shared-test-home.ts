/**
 * A test's home, data directory and working directory are its own.
 *
 * A fixed path under the shared temp root (`/tmp`, `/var/tmp`,
 * `/private/tmp`, `/private/var/tmp`, `/dev/shm`, or `tmpdir()` itself)
 * given as a test's home, data or working directory is shared by every run
 * and every parallel suite: what one test writes there, the next one reads,
 * so a result depends on run order.
 *
 * The rule reads a value given to a home key: an object property, a JSX
 * attribute, a binding, a parameter or destructuring default, a class field,
 * or an assignment (`process.env.HOME = "/tmp"`). The keys are `home`,
 * `HOME`, `homeDir`, `homeDirectory`, `dataDir`, `cwd` and any `…Cwd` name
 * (`sessionCwd`), plus the `keys` option (`["GENT_DATA_DIR", "userDir"]`).
 * The value is shared when it holds a string or template that starts with a
 * shared root (`"/tmp/case"`, `path.join("/tmp", "case")`) or calls
 * `tmpdir()`, unless it makes a unique directory (`mkdtemp*`,
 * `makeTempDirectory*`).
 *
 * Test code (`*.test.*`, `*.spec.*` and the `effect.testFiles` setting) is
 * read whole. Elsewhere only a test layer is read: the value of a `static`
 * member, binding, function or object key named `Test`, `…Test`,
 * `…TestLayer`, `…TestActor` or `…TestLayers` (`static Test = ...`,
 * `makeTestLayer`). A test that writes takes `makeTempDirectoryScoped`; a
 * test that only names a directory takes a path no test can create, such as
 * `/nonexistent/<name>`.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { ancestors } from "./_ast-ancestors.js";
import { childNodesAt, isAstNode } from "./_ast-children.js";
import { staticMemberName } from "./_global-values.js";
import { isTestModule } from "./_test-files.js";

const Options = Schema.UndefinedOr(
  Schema.Struct({ keys: Schema.optionalKey(Schema.Array(Schema.String)) }),
);

const defaultKeys = ["home", "HOME", "homeDir", "homeDirectory", "dataDir", "cwd"];
/** `sessionCwd`, `alphaCwd`: a working directory under another name. */
const cwdName = /^[a-z]\w*Cwd$/u;

/**
 * Text that starts at a shared temp root: `/tmp`, `/var/tmp`, `/private/tmp`,
 * `/dev/shm`. A template's first chunk ends where an interpolation starts, so
 * `` `/tmp${x}` `` names the root too.
 */
const sharedRoot = /^(?:(?:\/private)?(?:\/var)?\/tmp|\/dev\/shm)(?:\/|$)/u;

const uniqueTempCall = /^(?:mkdtemp|makeTempDirectory)/u;

/** A test layer's name: `Test`, `NotesTest`, `FakeTestActor`, `makeTestLayer`. */
const testLayerName = /^(?:(?:[A-Z]\w*)?Test(?:Layers?|Actor)?|\w*TestLayers?)$/u;

const message =
  "A test home, data directory or working directory under the shared temp root is shared by every run and parallel suite. Use makeTempDirectoryScoped when the test reads or writes there, or a /nonexistent/<name> path when it only names one.";

const isNode = (value: unknown): value is ESTree.Node => isAstNode(value);

/** The name a key spells, when it is static: `home`, `"HOME"`. */
const keyName = (key: ESTree.Node, computed: boolean): Option.Option<string> => {
  if (key.type === "Identifier" && !computed) return Option.some(key.name);
  if (key.type === "PrivateIdentifier") return Option.some(key.name);
  if (key.type === "Literal" && Predicate.isString(key.value)) return Option.some(key.value);
  return Option.none();
};

/** The name a call reads: `tmpdir` in `tmpdir()` and `os.tmpdir()`. */
const calleeName = (node: ESTree.CallExpression): Option.Option<string> => {
  if (node.callee.type === "Identifier") return Option.some(node.callee.name);
  if (node.callee.type === "MemberExpression") return staticMemberName(node.callee);
  return Option.none();
};

/** Whether a node declares a test layer: its binding, member or key carries a test layer's name. */
const isTestLayerDeclaration = (node: ESTree.Node): boolean => {
  const named = (name: Option.Option<string>) => Option.exists(name, (n) => testLayerName.test(n));
  if (node.type === "VariableDeclarator" || node.type === "FunctionDeclaration") {
    return node.id?.type === "Identifier" && testLayerName.test(node.id.name);
  }
  if (node.type === "PropertyDefinition" || node.type === "MethodDefinition") {
    return node.static && named(keyName(node.key, node.computed));
  }
  if (node.type === "Property") return named(keyName(node.key, node.computed));
  return false;
};

export const noSharedTestHome = Rule.define({
  name: "no-shared-test-home",
  meta: Rule.meta({
    type: "problem",
    description:
      "Give a test its own home, data and working directory, not a fixed path under the shared temp root.",
    schema: [
      {
        type: "object",
        properties: { keys: { type: "array", items: { type: "string" } } },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ keys: [] }],
  }),
  options: Options,
  create: function* (options) {
    const ctx = yield* RuleContext;
    const keys = new Set([...defaultKeys, ...(options?.keys ?? [])]);
    const testCode = isTestModule(ctx);
    const visitorKeys = ctx.sourceCode.visitorKeys;

    const isHomeKey = (name: string): boolean => keys.has(name) || cwdName.test(name);

    /** `node` and every node under it. */
    const descendants = (node: ESTree.Node): ReadonlyArray<ESTree.Node> => [
      node,
      ...(visitorKeys[node.type] ?? [])
        .flatMap((key) => childNodesAt(node, key, isNode))
        .flatMap(descendants),
    ];

    const namesSharedRoot = (node: ESTree.Node): boolean => {
      if (node.type === "Literal")
        return Predicate.isString(node.value) && sharedRoot.test(node.value);
      if (node.type === "TemplateLiteral") {
        return sharedRoot.test(node.quasis[0]?.value.cooked ?? "");
      }
      if (node.type === "CallExpression") {
        return Option.exists(calleeName(node), (name) => name === "tmpdir");
      }
      return false;
    };

    const isUniqueTemp = (node: ESTree.Node): boolean =>
      node.type === "CallExpression" &&
      Option.exists(calleeName(node), (name) => uniqueTempCall.test(name));

    /** A value under the shared temp root that makes no unique directory. */
    const isSharedValue = (value: ESTree.Node): boolean => {
      const nodes = descendants(value);
      return nodes.some(namesSharedRoot) && !nodes.some(isUniqueTemp);
    };

    /** Test code is read whole; elsewhere only what a test layer declares. */
    const inScope = (node: ESTree.Node): boolean =>
      testCode || [...ancestors(node)].some(isTestLayerDeclaration);

    const check = (
      key: ESTree.Node,
      name: Option.Option<string>,
      value: Option.Option<ESTree.Node>,
    ): Effect.Effect<void> => {
      if (Option.isNone(value) || !Option.exists(name, isHomeKey)) return Effect.void;
      if (!isSharedValue(value.value) || !inScope(key)) return Effect.void;
      return ctx.report(Diagnostic.make({ node: key, message }));
    };

    return {
      Property: (node: ESTree.ObjectProperty) => {
        // A destructuring key binds a name; its default is an AssignmentPattern.
        if (node.parent?.type !== "ObjectExpression") return Effect.void;
        return check(node.key, keyName(node.key, node.computed), Option.some(node.value));
      },
      PropertyDefinition: (node: ESTree.PropertyDefinition) =>
        check(node.key, keyName(node.key, node.computed), Option.fromNullishOr(node.value)),
      VariableDeclarator: (node: ESTree.VariableDeclarator) => {
        if (node.id.type !== "Identifier") return Effect.void;
        return check(node.id, Option.some(node.id.name), Option.fromNullishOr(node.init));
      },
      AssignmentPattern: (node: ESTree.AssignmentPattern) => {
        if (node.left.type !== "Identifier") return Effect.void;
        return check(node.left, Option.some(node.left.name), Option.some(node.right));
      },
      AssignmentExpression: (node: ESTree.AssignmentExpression) => {
        if (node.operator !== "=") return Effect.void;
        if (node.left.type === "Identifier") {
          return check(node.left, Option.some(node.left.name), Option.some(node.right));
        }
        if (node.left.type === "MemberExpression") {
          return check(node.left, staticMemberName(node.left), Option.some(node.right));
        }
        return Effect.void;
      },
      JSXAttribute: (node: ESTree.JSXAttribute) => {
        if (node.name.type !== "JSXIdentifier") return Effect.void;
        return check(node.name, Option.some(node.name.name), Option.fromNullishOr(node.value));
      },
    };
  },
});

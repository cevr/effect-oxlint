/**
 * Mysterious Name (Refactoring): a top-level function named with a bare
 * generic verb, or a const that only aliases another function.
 *
 * Reported: a top-level or exported function (`function`, arrow, or
 * `Effect.fn`/`Effect.fnUntraced`) whose name is a generic verb (`run`,
 * `handle`, `process`, ...) alone or with a vague noun (`processData`,
 * `doWork`); and, in any scope, `const x = f` where `f` is a local function.
 * `make`, `layer`, `fetch`, `lookup` and `of` are allowed by default. Test
 * code is skipped unless `ignoreTests: false`. Ported from K-Mistele/anti-slop
 * (`martinfowler/mysterious-name`, b7c1619, MIT; THIRD_PARTY_NOTICES.md).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Diagnostic, Rule, RuleContext, Scope } from "../vendor/effect-oxlint/index.js";
import { isFunction, unwrap } from "./_anti-slop-effect.js";
import { isTestModule, skipFile } from "./_test-files.js";

const defaultVerbs = [
  "apply",
  "do",
  "doWork",
  "ensure",
  "execute",
  "handle",
  "init",
  "initialize",
  "manage",
  "perform",
  "prepare",
  "process",
  "resolve",
  "run",
  "sync",
  "update",
];

const defaultVagueNouns = [
  "All",
  "Data",
  "Info",
  "It",
  "Item",
  "Items",
  "Logic",
  "Stuff",
  "Thing",
  "Things",
  "Value",
  "Values",
  "Work",
];

const defaultAllowNames = ["fetch", "layer", "lookup", "make", "of"];

const MysteriousNameOptions = Schema.UndefinedOr(
  Schema.Struct({
    ignoreTests: Schema.optionalKey(Schema.Boolean),
    verbs: Schema.optionalKey(Schema.Array(Schema.String)),
    vagueNouns: Schema.optionalKey(Schema.Array(Schema.String)),
    allowNames: Schema.optionalKey(Schema.Array(Schema.String)),
    checkAliases: Schema.optionalKey(Schema.Boolean),
  }),
);

/** A file under a test directory, beside `*.test.*` and `*.spec.*`. */
const testDirectory = /(?:^|\/)(?:__tests__|__mocks__|test|tests)\//u;

/** What a call calls, or the expression itself. */
const calledOrSelf = (node: ESTree.Node): ESTree.Node => {
  const expression = unwrap(node);
  if (expression.type === "CallExpression") return unwrap(expression.callee);
  return expression;
};

/** Whether `callee` is `X.fn` or `X.fnUntraced`, or a call of one (`Effect.fn("name")`). */
const isFnConstructor = (callee: ESTree.Node): boolean => {
  const constructor = calledOrSelf(callee);
  return (
    constructor.type === "MemberExpression" &&
    !constructor.computed &&
    constructor.property.type === "Identifier" &&
    (constructor.property.name === "fn" || constructor.property.name === "fnUntraced")
  );
};

/** `Effect.fn("x")(function* () {})`, `Effect.fn(function* () {})`, or a plain function. */
const isFunctionValue = (init: ESTree.Expression): boolean => {
  const value = unwrap(init);
  if (isFunction(value)) return true;
  if (value.type !== "CallExpression") return false;
  const hasFunctionArgument = value.arguments.some(
    (argument) => argument.type !== "SpreadElement" && isFunction(unwrap(argument)),
  );
  return hasFunctionArgument && isFnConstructor(value.callee);
};

export const mysteriousName = Rule.define({
  name: "mysterious-name",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Disallow top-level functions named with a bare generic verb, and consts that only alias another function (Refactoring, Mysterious Name).",
    schema: [
      {
        type: "object",
        properties: {
          ignoreTests: { type: "boolean" },
          verbs: { type: "array", items: { type: "string" } },
          vagueNouns: { type: "array", items: { type: "string" } },
          allowNames: { type: "array", items: { type: "string" } },
          checkAliases: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [
      {
        ignoreTests: true,
        verbs: defaultVerbs,
        vagueNouns: defaultVagueNouns,
        allowNames: defaultAllowNames,
        checkAliases: true,
      },
    ],
  }),
  options: MysteriousNameOptions,
  create: function* (options) {
    const ctx = yield* RuleContext;
    const isTest = isTestModule(ctx) || testDirectory.test(ctx.filename.replaceAll("\\", "/"));
    if (options?.ignoreTests !== false && isTest) return skipFile;
    const verbs = new Set(options?.verbs ?? defaultVerbs);
    const vagueNouns = options?.vagueNouns ?? defaultVagueNouns;
    const allowNames = new Set(options?.allowNames ?? defaultAllowNames);
    const checkAliases = options?.checkAliases !== false;

    const isGeneric = (name: string): boolean => {
      if (allowNames.has(name)) return false;
      if (verbs.has(name)) return true;
      return vagueNouns.some(
        (noun) => name.endsWith(noun) && verbs.has(name.slice(0, name.length - noun.length)),
      );
    };

    const genericName = (identifier: ESTree.BindingIdentifier) => {
      if (!isGeneric(identifier.name)) return Effect.void;
      return ctx.report(
        Diagnostic.make({
          node: identifier,
          message: `\`${identifier.name}\` is a generic verb with no object, so callers cannot tell which steps it performs or what it reads, writes or calls. Rename it for each caller-visible step it performs (for example \`resolveConfiguration\` → \`loadAndReconcileConfigurationSources\`).`,
        }),
      );
    };

    /** The function names a top-level declaration binds. */
    const functionNames = (declaration: ESTree.Node): ReadonlyArray<ESTree.BindingIdentifier> => {
      if (declaration.type === "FunctionDeclaration") {
        return Option.toArray(Option.fromNullishOr(declaration.id));
      }
      if (declaration.type !== "VariableDeclaration") return [];
      return declaration.declarations.flatMap(
        (declarator): ReadonlyArray<ESTree.BindingIdentifier> => {
          if (declarator.id.type !== "Identifier") return [];
          const id = declarator.id;
          return Option.toArray(
            Option.map(
              Option.filter(Option.fromNullishOr(declarator.init), isFunctionValue),
              () => id,
            ),
          );
        },
      );
    };

    /** The declaration a top-level statement holds, under `export` and `export default`. */
    const declarationOf = (statement: ESTree.Node): Option.Option<ESTree.Node> => {
      if (statement.type === "ExportDefaultDeclaration") return Option.some(statement.declaration);
      if (statement.type === "ExportNamedDeclaration") {
        return Option.fromNullishOr(statement.declaration);
      }
      return Option.some(statement);
    };

    /** The local function an identifier names: a function declaration, or a const bound to a function value. */
    const aliasedFunction = (init: ESTree.Expression): Option.Option<string> => {
      const value = unwrap(init);
      if (value.type !== "Identifier") return Option.none();
      return Option.flatMap(
        Scope.findVariableUp(ctx.sourceCode.getScope(value), value.name),
        (variable) => {
          const definition = variable.defs.at(0);
          if (!definition) return Option.none();
          const declared = definition.node;
          // A parameter's definition node is its function, so check the definition kind first.
          if (definition.type === "FunctionName" && declared.type === "FunctionDeclaration") {
            return Option.some(value.name);
          }
          if (definition.type !== "Variable" || declared.type !== "VariableDeclarator") {
            return Option.none();
          }
          return Option.map(
            Option.filter(Option.fromNullishOr(declared.init), isFunctionValue),
            () => value.name,
          );
        },
      );
    };

    /** The function a `const` declarator only aliases. */
    const aliasTarget = (declarator: ESTree.VariableDeclarator): Option.Option<string> => {
      const declaration = declarator.parent;
      if (declaration?.type !== "VariableDeclaration" || declaration.kind !== "const") {
        return Option.none();
      }
      if (declarator.id.type !== "Identifier") return Option.none();
      const name = declarator.id.name;
      return Option.filter(
        Option.flatMap(Option.fromNullishOr(declarator.init), aliasedFunction),
        (target) => target !== name,
      );
    };

    return {
      // Aliases are checked in every scope: a local `const executeMutation = refreshAuthentication`
      // hides behavior as much as a top-level one.
      VariableDeclarator: (declarator: ESTree.VariableDeclarator) => {
        if (!checkAliases) return Effect.void;
        return Option.match(aliasTarget(declarator), {
          onNone: () => Effect.void,
          onSome: (target) =>
            ctx.report(
              Diagnostic.make({
                node: declarator,
                message: `\`${ctx.sourceCode.getText(declarator.id)}\` only aliases \`${target}\`, so one behavior has two names and readers must check whether they differ. Delete the alias and call \`${target}\` directly, or rename the one function so its name states what it does.`,
              }),
            ),
        });
      },
      Program: (program: ESTree.Program) =>
        Effect.forEach(
          program.body.flatMap((statement) =>
            Option.toArray(declarationOf(statement)).flatMap(functionNames),
          ),
          genericName,
          { discard: true },
        ),
    };
  },
});

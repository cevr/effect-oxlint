/**
 * Require `forceKillAfter` on every Effect child process command.
 *
 * When the scope that owns a child closes (interruption, a timeout), the
 * platform spawner sends the command's `killSignal` (SIGTERM unless it names
 * one), polls the process group for up to one second, and then waits for
 * the child to exit with no bound unless the command names `forceKillAfter`.
 * A child that ignores that signal holds its scope open forever. With
 * `forceKillAfter`, the spawner escalates to SIGKILL. A command whose
 * `killSignal` is SIGKILL needs none: no child can ignore it.
 *
 * The rule reads `make` from `effect/process` (`ChildProcess.make`, and
 * `P.ChildProcess.make` through a namespace import) and from
 * `effect/process/ChildProcess` (a namespace import, or the named `make`
 * under any alias). It reports:
 *
 * - `make("cmd")` and `make("cmd", ["arg"])` with no options, the arguments
 *   an array literal, a `const` holding one, or a parameter that holds an
 *   array (a rest parameter, or one typed `T[]`, `readonly T[]`, `Array<T>`
 *   or `ReadonlyArray<T>`);
 * - an options object literal, inline or held in a `const`, that does not
 *   name `forceKillAfter` (in itself or a spread object literal), unless it
 *   names `killSignal: "SIGKILL"`;
 * - the bare template form ``make`cmd` ``, which cannot carry options: write
 *   ``make({ forceKillAfter: "5 seconds" })`cmd` `` instead.
 *
 * Options the rule cannot see (an untyped parameter, a call result, a spread
 * of one) are left alone.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";

import { Diagnostic, Rule, RuleContext, Scope } from "../vendor/effect-oxlint/index.js";
import { expressionArgument, staticProperties } from "./_call-arguments.js";
import { constResolver } from "./_const-bindings.js";
import { staticMemberName } from "./_global-values.js";

const processModule = "effect/process";
const childProcessModule = "effect/process/ChildProcess";

/** Whether a type is an array: `T[]`, `readonly T[]`, `Array<T>` or `ReadonlyArray<T>`. */
const isArrayType = (type: ESTree.TSType): boolean => {
  if (type.type === "TSArrayType") return true;
  if (type.type === "TSTypeOperator")
    return (
      type.operator === "readonly" &&
      Option.exists(Option.fromNullishOr(type.typeAnnotation), isArrayType)
    );
  return (
    type.type === "TSTypeReference" &&
    type.typeName.type === "Identifier" &&
    (type.typeName.name === "Array" || type.typeName.name === "ReadonlyArray")
  );
};

/** The exported name an import specifier reads: `make` in `{ make as cmd }` or `{ "make" as cmd }`. */
const importedName = (specifier: ESTree.ImportSpecifier): string => {
  if (specifier.imported.type === "Identifier") return specifier.imported.name;
  return specifier.imported.value;
};

/** The signal a command's options name: none (SIGTERM, the spawner's default), one the rule reads, or one it cannot. */
const Signal = Schema.TaggedUnion({
  Default: {},
  Named: { name: Schema.String },
  Unread: {},
});
type Signal = typeof Signal.Type;

/** What an options argument tells the rule: whether it names `forceKillAfter`, and the signal it names. */
const Options = Schema.TaggedUnion({
  Named: {},
  Missing: { signal: Signal },
  Unknown: {},
});
type Options = typeof Options.Type;

const named: Options = Options.cases.Named.make({});
const unknown: Options = Options.cases.Unknown.make({});
const missing = (signal: Signal): Options => Options.cases.Missing.make({ signal });
const defaultSignal: Signal = Signal.cases.Default.make({});
const unreadSignal: Signal = Signal.cases.Unread.make({});

/** What the spawner sends, and what a child ignores, as a report names them. */
interface Sent {
  readonly sent: string;
  readonly ignored: string;
}

const sends = (signal: Signal): Sent =>
  Signal.match(signal, {
    Default: () => ({ sent: "SIGTERM (no killSignal is named)", ignored: "SIGTERM" }),
    Named: ({ name }) => ({ sent: `the command's killSignal, ${name}`, ignored: name }),
    Unread: () => ({ sent: "the command's killSignal", ignored: "that signal" }),
  });

const message = (signal: Signal) => {
  const { sent, ignored } = sends(signal);
  return `ChildProcess.make without forceKillAfter: on interrupt or timeout the spawner sends ${sent}, waits 1 s, then waits for exit with no bound, so a child that ignores ${ignored} holds its scope open forever. Name forceKillAfter in the command options, such as \`forceKillAfter: "5 seconds"\`.`;
};

/** Whether a signal is SIGKILL, which no child can ignore. */
const isKill = (signal: Signal) =>
  signal._tag === "Named" && (signal.name === "SIGKILL" || signal.name === "9");

const templateMessage =
  'The template form of ChildProcess.make cannot carry forceKillAfter. Write make({ forceKillAfter: "5 seconds" })`cmd` so a child that ignores SIGTERM cannot hold its scope open forever.';

export const requireForceKillAfter = Rule.define({
  name: "require-force-kill-after",
  meta: Rule.meta({
    type: "problem",
    description:
      "Name forceKillAfter on every ChildProcess.make command so a child that ignores SIGTERM cannot hold its scope open.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const resolve = constResolver(ctx);
    /** Locals holding the `effect/process` barrel: `import * as P from "effect/process"`. */
    const processNamespaces = new Set<string>();
    /** Locals holding the ChildProcess module. */
    const childProcessNamespaces = new Set<string>();
    /** Locals holding `make` itself. */
    const makeFunctions = new Set<string>();

    /** An identifier that still reads its import, not a local binding of the same name. */
    const readsImport = (
      node: ESTree.Node & { readonly name: string },
      names: ReadonlySet<string>,
    ): boolean =>
      names.has(node.name) &&
      Option.match(Scope.findVariableUp(ctx.sourceCode.getScope(node), node.name), {
        onNone: () => false,
        onSome: (variable) =>
          variable.defs.some((definition) => definition.type === "ImportBinding"),
      });

    const isMember = (node: ESTree.Node, name: string): node is ESTree.MemberExpression =>
      node.type === "MemberExpression" &&
      Option.exists(staticMemberName(node), (property) => property === name);

    /** `ChildProcess` read off the module: a namespace local, or `P.ChildProcess`. */
    const isChildProcessModule = (node: ESTree.Node): boolean => {
      if (node.type === "Identifier") return readsImport(node, childProcessNamespaces);
      return (
        isMember(node, "ChildProcess") &&
        node.object.type === "Identifier" &&
        readsImport(node.object, processNamespaces)
      );
    };

    const isMake = (node: ESTree.Node): boolean => {
      if (node.type === "Identifier") return readsImport(node, makeFunctions);
      return isMember(node, "make") && isChildProcessModule(node.object);
    };

    /**
     * Whether `node` reads a parameter that holds an array: a rest parameter,
     * or one typed `T[]`, `readonly T[]`, `Array<T>` or `ReadonlyArray<T>`.
     */
    const isArrayParameter = (node: ESTree.Node): boolean => {
      if (node.type !== "Identifier") return false;
      return Option.exists(
        Scope.findVariableUp(ctx.sourceCode.getScope(node), node.name),
        (variable) => {
          const definition = variable.defs[0];
          if (variable.defs.length !== 1 || definition?.type !== "Parameter") return false;
          const name = definition.name;
          if (name.parent?.type === "RestElement") return true;
          if (name.type !== "Identifier") return false;
          return Option.exists(Option.fromNullishOr(name.typeAnnotation), (annotation) =>
            isArrayType(annotation.typeAnnotation),
          );
        },
      );
    };

    /** The signal an options object names: its `killSignal`, read when it is a literal. */
    const signalOf = (value: ESTree.ObjectExpression): Signal => {
      const signal = Arr.head(staticProperties(value, "killSignal")).pipe(
        Option.map((property) => resolve(property.value)),
      );
      if (Option.isNone(signal)) {
        if (value.properties.some((p) => p.type === "SpreadElement")) return unreadSignal;
        return defaultSignal;
      }
      const literal = signal.value;
      if (
        literal.type === "Literal" &&
        (Predicate.isString(literal.value) || Predicate.isNumber(literal.value))
      )
        return Signal.cases.Named.make({ name: String(literal.value) });
      return unreadSignal;
    };

    /** Whether an options expression names `forceKillAfter`, lacks it, or cannot be read. */
    const optionsOf = (expression: ESTree.Expression): Options => {
      const value = resolve(expression);
      if (value.type !== "ObjectExpression") return unknown;
      if (staticProperties(value, "forceKillAfter").length > 0) return named;
      let found: Options = missing(signalOf(value));
      for (const property of value.properties) {
        if (property.type !== "SpreadElement") continue;
        const spread = optionsOf(property.argument);
        if (spread._tag === "Named") return named;
        if (spread._tag === "Unknown") found = unknown;
      }
      return found;
    };

    /**
     * The options of `make(...)`: the first argument of the options-then-template
     * form, else the argument after the command and its argument array.
     */
    const callOptions = (node: ESTree.CallExpression): Options => {
      const first = expressionArgument(node, 0);
      if (Option.isNone(first)) return unknown;
      const firstValue = resolve(first.value);
      const isTag = node.parent?.type === "TaggedTemplateExpression" && node.parent.tag === node;
      if (isTag || firstValue.type === "ObjectExpression") return optionsOf(first.value);
      if (node.arguments.some((argument) => argument.type === "SpreadElement")) return unknown;
      const second = expressionArgument(node, 1);
      if (Option.isNone(second)) return missing(defaultSignal);
      const secondValue = resolve(second.value);
      if (secondValue.type === "ObjectExpression") return optionsOf(second.value);
      const third = expressionArgument(node, 2);
      if (Option.isSome(third)) return optionsOf(third.value);
      // `make(cmd, args)`: an array, or a value that may be the options.
      if (secondValue.type === "ArrayExpression" || isArrayParameter(secondValue))
        return missing(defaultSignal);
      return unknown;
    };

    const report = (node: ESTree.Node, text: string) =>
      ctx.report(Diagnostic.make({ node, message: text }));

    return {
      ImportDeclaration: (node: ESTree.ImportDeclaration) => {
        const source = node.source.value;
        if (source !== processModule && source !== childProcessModule) return Effect.void;
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportNamespaceSpecifier") {
            if (source === processModule) processNamespaces.add(specifier.local.name);
            else childProcessNamespaces.add(specifier.local.name);
            continue;
          }
          if (specifier.type !== "ImportSpecifier" || specifier.importKind === "type") continue;
          const imported = importedName(specifier);
          if (source === processModule && imported === "ChildProcess") {
            childProcessNamespaces.add(specifier.local.name);
          }
          if (source === childProcessModule && imported === "make") {
            makeFunctions.add(specifier.local.name);
          }
        }
        return Effect.void;
      },
      CallExpression: (node: ESTree.CallExpression) => {
        if (node.callee.type === "Super" || !isMake(node.callee)) return Effect.void;
        const options = callOptions(node);
        if (options._tag !== "Missing" || isKill(options.signal)) return Effect.void;
        return report(node, message(options.signal));
      },
      TaggedTemplateExpression: (node: ESTree.TaggedTemplateExpression) => {
        if (!isMake(node.tag)) return Effect.void;
        return report(node, templateMessage);
      },
    };
  },
});

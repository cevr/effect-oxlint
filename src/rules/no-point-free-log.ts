/**
 * Call a logger; never hand one point-free to a callback that is passed an index.
 *
 * A logger that prints every argument it is given (`console.log`, `info`,
 * `warn`, `error`, `debug` and `trace`, effect's `Console` members of the
 * same names, and `Effect.log`, `logFatal`, `logError`, `logWarning`,
 * `logInfo`, `logDebug` and `logTrace`) prints the index after each line when
 * a callback passes one: `Effect.forEach(lines, Console.log)` prints
 * `… text="tighter" 0`, and a reader of the output gets a field that is not
 * there. Write `(line) => Console.log(line)`. A member that takes a label, a
 * column filter or options (`count`, `time`, `table`, `dir`) prints no index
 * and passes.
 *
 * Calls that pass their callback an index: `Effect.forEach`, `Effect.filter`
 * and `Effect.partition`; effect's `Array` module's `forEach`, `map`,
 * `flatMap`, `filter`, `some`, `every`, `findFirst` and the rest of the
 * array names below; and an array literal's own methods. Every other member
 * of an effect module (`Exit.map`, `Option.map`, `Stream.map`,
 * `Fiber.map`) passes one value and passes. A method of the same name on
 * any other receiver passes an index only when the receiver is an array,
 * which the rule cannot see, so its report says what prints if it is one.
 *
 * Each module is read by its binding: `Console` and `Effect` are effect's
 * when imported from `effect` (under any alias) or from `effect/Console` and
 * `effect/Effect` whole, or when the file binds the name nowhere; `console`
 * is the global. A name of the file's own, of the same spelling, is neither.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { memberName, type NameBindings, nameBindings } from "./_name-bindings.js";

/** Methods an array calls its callback with `(element, index, array)`. */
const arrayIndexed = new Set([
  "forEach",
  "map",
  "flatMap",
  "filter",
  "some",
  "every",
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
  "reduce",
  "reduceRight",
]);

/** effect's `Array` module members that call their callback with `(element, index)`. */
const effectArrayIndexed = new Set([...arrayIndexed, "findFirst", "findFirstIndex"]);

/** `Effect` members that call their callback with `(element, index)`. */
const effectIndexed = new Set(["forEach", "filter", "partition"]);

/** The members of `console` and effect's `Console` that print every argument they are given. */
const printers = new Set(["log", "info", "warn", "error", "debug", "trace"]);

/** The `Effect` loggers, each of which prints every message it is given. */
const effectLoggers = new Set([
  "log",
  "logFatal",
  "logError",
  "logWarning",
  "logInfo",
  "logDebug",
  "logTrace",
]);

/** Whether `node` is effect's module `name`: imported from `effect` (or an alias), `effect/<name>` whole, or the unbound name. */
const isEffectModule = (bindings: NameBindings, node: ESTree.Node, name: string): boolean =>
  bindings.importsAs(node, (from) => from === "effect", name) ||
  bindings.importsAs(node, (from) => from === `effect/${name}`, "*") ||
  bindings.isGlobal(node, name);

/** effect's modules whose callbacks take one value, read as effect's when the file binds the name nowhere. */
const oneValueModules: ReadonlyArray<string> = [
  "Stream",
  "Option",
  "Result",
  "Layer",
  "Exit",
  "Fiber",
  "Config",
  "Schedule",
];

/** Whether `node` is a module of effect's other than `Effect` and `Array`: any import from effect, or an unbound one-value module. */
const isOtherEffectModule = (bindings: NameBindings, node: ESTree.Node): boolean =>
  bindings.importsFrom(node, (from) => from === "effect" || from.startsWith("effect/")) ||
  oneValueModules.some((name) => bindings.isGlobal(node, name));

/** `Console.log`, `console.error`, `Effect.logInfo`: the logger an argument names, when it prints every argument. */
const loggerOf = (bindings: NameBindings, node: ESTree.Node): Option.Option<string> => {
  if (node.type !== "MemberExpression") return Option.none();
  const owner = node.object;
  return Option.flatMap(memberName(node), (name) => {
    if (printers.has(name) && isEffectModule(bindings, owner, "Console"))
      return Option.some(`Console.${name}`);
    if (printers.has(name) && bindings.isGlobal(owner, "console"))
      return Option.some(`console.${name}`);
    if (effectLoggers.has(name) && isEffectModule(bindings, owner, "Effect"))
      return Option.some(`Effect.${name}`);
    return Option.none();
  });
};

/**
 * What a call passes its callback after each element: a call known to pass an
 * index (`Effect.forEach`, `Array.map`, an array literal's `forEach`), or a
 * method that does when its receiver is an array.
 */
const Passes = Schema.TaggedUnion({
  Known: { call: Schema.String, extra: Schema.String, they: Schema.String },
  IfArray: { method: Schema.String },
});
type Passes = typeof Passes.Type;

/** A call that passes the index alone: `Effect.forEach`, `Array.map`. */
const passesIndex = (call: string): Passes =>
  Passes.cases.Known.make({ call, extra: "the index", they: "the index prints" });

/** What a call passes its callback besides the element, if it passes anything. */
const passesOf = (bindings: NameBindings, call: ESTree.CallExpression): Option.Option<Passes> => {
  const callee = call.callee;
  if (callee.type !== "MemberExpression") return Option.none();
  const receiver = callee.object;
  return Option.flatMap(memberName(callee), (method): Option.Option<Passes> => {
    if (isEffectModule(bindings, receiver, "Effect"))
      return Option.liftPredicate(passesIndex(`Effect.${method}`), () => effectIndexed.has(method));
    if (isEffectModule(bindings, receiver, "Array"))
      return Option.liftPredicate(passesIndex(`Array.${method}`), () =>
        effectArrayIndexed.has(method),
      );
    if (isOtherEffectModule(bindings, receiver)) return Option.none();
    if (!arrayIndexed.has(method)) return Option.none();
    if (receiver.type === "ArrayExpression")
      return Option.some(
        Passes.cases.Known.make({
          call: `an array's ${method}`,
          extra: "the index and the array",
          they: "they print",
        }),
      );
    return Option.some(Passes.cases.IfArray.make({ method }));
  });
};

/** The report for a logger handed to a call that passes `passes`. */
const messageOf = (name: string, passes: Passes): string => {
  const fix = `Write (line) => ${name}(line).`;
  return Passes.match(passes, {
    IfArray: ({ method }) =>
      `${name} passed point-free prints every argument it is given: if this is an array, its ${method} passes the index and the array after each element, and they print too. ${fix}`,
    Known: ({ call, extra, they }) =>
      `${name} passed point-free prints every argument it is given, and ${call} passes ${extra} after each element, so ${they} too. ${fix}`,
  });
};

export const noPointFreeLog = Rule.define({
  name: "no-point-free-log",
  meta: Rule.meta({
    type: "problem",
    description:
      "Call a logger in a callback: a logger that prints every argument (console.log, Console.log, Effect.log*) handed point-free to a callback that is passed an index prints the index after each line.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const bindings = nameBindings(ctx);
    return {
      CallExpression: (node: ESTree.CallExpression) =>
        Option.match(passesOf(bindings, node), {
          onNone: () => Effect.void,
          onSome: (passes) =>
            Effect.forEach(
              node.arguments.flatMap((argument) =>
                Option.toArray(loggerOf(bindings, argument)).map((name) => ({ argument, name })),
              ),
              ({ argument, name }) =>
                ctx.report(Diagnostic.make({ node: argument, message: messageOf(name, passes) })),
              { discard: true },
            ),
        }),
    };
  },
});

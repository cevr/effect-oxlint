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
 * The calls the rule reads, each at its callback's place only (a `thisArg`
 * or a seed is never called): `Effect.forEach`, `Effect.filter` and
 * `Effect.partition`; effect's `Array` module's `forEach`, `map`, `flatMap`,
 * `filter`, `some`, `every`, `findFirst` and the rest of the array names
 * below; and an array literal's own methods. A reducer (`reduce`,
 * `reduceRight`) is passed the accumulator first, so its report names that
 * too. The rule does not read the other modules of effect (`Exit`,
 * `Option`, `Stream`, `Chunk`, `Iterable`, …): a logger handed to one of
 * their members is not reported, whether or not that member passes an
 * index. A method of an array's name on any other receiver passes an index
 * only when the receiver is an array, which the rule cannot see, so its
 * report says what prints if it is one.
 *
 * Each module is read by its binding: `Console` and `Effect` are effect's
 * when imported from `effect` (under any alias) or from `effect/Console` and
 * `effect/Effect` whole, or when the file binds the name nowhere; `console`
 * is the global. A name of the file's own, of the same spelling, is neither.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
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

/** effect's other modules, read as effect's when the file binds the name nowhere: the rule does not read their members. */
const otherModules: ReadonlyArray<string> = [
  "Stream",
  "Option",
  "Result",
  "Layer",
  "Exit",
  "Fiber",
  "Config",
  "Schedule",
];

/** Whether `node` is a module of effect's other than `Effect` and `Array`: any import from effect, or an unbound one of `otherModules`. */
const isOtherEffectModule = (bindings: NameBindings, node: ESTree.Node): boolean =>
  bindings.importsFrom(node, (from) => from === "effect" || from.startsWith("effect/")) ||
  otherModules.some((name) => bindings.isGlobal(node, name));

/** The reducers: their callback is passed the accumulator before the element. */
const reducers: ReadonlySet<string> = new Set(["reduce", "reduceRight"]);

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
 * What a call passes its callback besides the element: a call known to pass
 * an index (`Effect.forEach`, `Array.map`, an array literal's `forEach`), or
 * a method that does when its receiver is an array. `at` is the callback's
 * place among the call's arguments; `reducer`, whether the accumulator
 * comes first.
 */
const Passes = Schema.TaggedUnion({
  Known: { call: Schema.String, passes: Schema.String, they: Schema.String },
  IfArray: { method: Schema.String },
});
type Passes = typeof Passes.Type;

interface Callback {
  readonly passes: Passes;
  readonly at: number;
  readonly reducer: boolean;
}

/**
 * The place of a module function's callback: data first (`Array.map(xs, f)`,
 * `Effect.forEach(xs, f, options)`, `Array.reduce(xs, b, f)`) or data last
 * (`Array.map(f)`, `Effect.forEach(f, options)`, `Array.reduce(b, f)`). A
 * data-last call takes only an options object after its callback.
 */
const moduleCallbackAt = (call: ESTree.CallExpression, reducer: boolean): number => {
  if (reducer) {
    if (call.arguments.length >= 3) return 2;
    return 1;
  }
  const dataLast = Option.match(Arr.get(call.arguments, 1), {
    onNone: () => true,
    onSome: (second) => second.type === "ObjectExpression",
  });
  if (dataLast) return 0;
  return 1;
};

/** What a module function passes its callback, and what prints, by whether it reduces. */
const modulePasses = (reducer: boolean) => {
  if (reducer)
    return { passes: "the accumulator, the element and the index", they: "all three print" };
  return { passes: "the index after each element", they: "the index prints too" };
};

/** What an array literal's method passes its callback, and what prints, by whether it reduces. */
const arrayPasses = (reducer: boolean) => {
  if (reducer)
    return {
      passes: "the accumulator, the element, the index and the array",
      they: "all four print",
    };
  return { passes: "the index and the array after each element", they: "they print too" };
};

/** What a module function passes after each element. */
const moduleCallback = (call: ESTree.CallExpression, name: string, method: string): Callback => {
  const reducer = reducers.has(method);
  return {
    passes: Passes.cases.Known.make({ call: `${name}.${method}`, ...modulePasses(reducer) }),
    at: moduleCallbackAt(call, reducer),
    reducer,
  };
};

/** What a call passes its callback, and where the callback is, if the rule reads that call. */
const callbackOf = (
  bindings: NameBindings,
  call: ESTree.CallExpression,
): Option.Option<Callback> => {
  const callee = call.callee;
  if (callee.type !== "MemberExpression") return Option.none();
  const receiver = callee.object;
  return Option.flatMap(memberName(callee), (method): Option.Option<Callback> => {
    if (isEffectModule(bindings, receiver, "Effect"))
      return Option.liftPredicate(moduleCallback(call, "Effect", method), () =>
        effectIndexed.has(method),
      );
    if (isEffectModule(bindings, receiver, "Array"))
      return Option.liftPredicate(moduleCallback(call, "Array", method), () =>
        effectArrayIndexed.has(method),
      );
    if (isOtherEffectModule(bindings, receiver)) return Option.none();
    if (!arrayIndexed.has(method)) return Option.none();
    const reducer = reducers.has(method);
    if (receiver.type === "ArrayExpression")
      return Option.some({
        passes: Passes.cases.Known.make({ call: `an array's ${method}`, ...arrayPasses(reducer) }),
        at: 0,
        reducer,
      });
    return Option.some({ passes: Passes.cases.IfArray.make({ method }), at: 0, reducer });
  });
};

/** The fix a report names: a callback that logs, or a reducer that logs and gives back its accumulator. */
const fixOf = (name: string, reducer: boolean): string => {
  if (reducer)
    return `Write a reducer that logs what it means to, such as (total, line) => { ${name}(line); return total; }.`;
  return `Write (line) => ${name}(line).`;
};

/** The report for a logger handed to a call whose callback is passed what `callback` says. */
const messageOf = (name: string, callback: Callback): string => {
  const fix = fixOf(name, callback.reducer);
  return Passes.match(callback.passes, {
    IfArray: ({ method }) => {
      const { passes, they } = arrayPasses(callback.reducer);
      return `${name} passed point-free prints every argument it is given: if this is an array, its ${method} passes ${passes}, and ${they}. ${fix}`;
    },
    Known: ({ call, passes, they }) =>
      `${name} passed point-free prints every argument it is given, and ${call} passes ${passes}, so ${they}. ${fix}`,
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
        Effect.forEach(
          Option.match(callbackOf(bindings, node), {
            onNone: () => [],
            onSome: (callback) =>
              Option.toArray(
                Option.flatMap(Option.fromUndefinedOr(node.arguments[callback.at]), (argument) =>
                  Option.map(loggerOf(bindings, argument), (name) => ({
                    argument,
                    name,
                    callback,
                  })),
                ),
              ),
          }),
          ({ argument, name, callback }) =>
            ctx.report(Diagnostic.make({ node: argument, message: messageOf(name, callback) })),
          { discard: true },
        ),
    };
  },
});

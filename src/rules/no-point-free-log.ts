/**
 * Call a logger; never hand one point-free to a callback that is passed an index.
 *
 * `Console.log`, `console.log` and the `Effect.log*` family are variadic, so
 * `Effect.forEach(lines, Console.log)` prints each line followed by its index
 * (`… text="tighter" 0`), and a reader of the output gets a field that is not
 * there. Write `(line) => Console.log(line)`.
 *
 * Callbacks passed an index: an array's `forEach`, `map`, `flatMap`,
 * `filter`, `some`, `every`, `find`, `findIndex` and `reduce` (and effect's
 * `Array` module's, under any name), and `Effect.forEach`, `Effect.filter`
 * and `Effect.partition`. The other members of `Effect`, `Stream`, `Option`,
 * `Result` and `Layer` pass one value, so `Effect.flatMap(x, Console.log)`
 * passes. Each module is read by its binding: `Console` and `Effect` are
 * effect's when imported from `effect` (under any alias) or from
 * `effect/Console` and `effect/Effect` whole, or when the file binds the
 * name nowhere; `console` is the global. A name of the file's own, of the
 * same spelling, is neither.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { memberName, type NameBindings, nameBindings } from "./_name-bindings.js";

/** Methods that pass their callback the element's index after it. */
const indexed = new Set([
  "forEach",
  "map",
  "flatMap",
  "filter",
  "some",
  "every",
  "find",
  "findIndex",
  "reduce",
]);

/** Effect modules whose callbacks take one value, but for the members in `indexedIn`. */
const oneValue: ReadonlyArray<string> = ["Effect", "Stream", "Option", "Result", "Layer"];
const indexedIn = new Set(["forEach", "filter", "partition"]);

/** Whether `node` is effect's module `name`: imported from `effect` (or an alias), `effect/<name>` whole, or the unbound name. */
const isEffectModule = (bindings: NameBindings, node: ESTree.Node, name: string): boolean =>
  bindings.importsAs(node, (from) => from === "effect", name) ||
  bindings.importsAs(node, (from) => from === `effect/${name}`, "*") ||
  bindings.isGlobal(node, name);

/** `Console.log`, `console.error`, `Effect.logInfo`: the logger an argument names, when it is one. */
const loggerOf = (bindings: NameBindings, node: ESTree.Node): Option.Option<string> => {
  if (node.type !== "MemberExpression") return Option.none();
  const owner = node.object;
  return Option.flatMap(memberName(node), (name) => {
    if (isEffectModule(bindings, owner, "Console")) return Option.some(`Console.${name}`);
    if (bindings.isGlobal(owner, "console")) return Option.some(`console.${name}`);
    if (isEffectModule(bindings, owner, "Effect") && name.startsWith("log"))
      return Option.some(`Effect.${name}`);
    return Option.none();
  });
};

/** Whether a call passes its callback an index: `xs.forEach(f)`, `Effect.forEach(xs, f)`, not `Effect.flatMap(x, f)`. */
const passesIndex = (bindings: NameBindings, call: ESTree.CallExpression): boolean => {
  const callee = call.callee;
  if (callee.type !== "MemberExpression") return false;
  return Option.exists(memberName(callee), (name) => {
    if (oneValue.some((module) => isEffectModule(bindings, callee.object, module)))
      return indexedIn.has(name);
    return indexed.has(name);
  });
};

export const noPointFreeLog = Rule.define({
  name: "no-point-free-log",
  meta: Rule.meta({
    type: "problem",
    description:
      "Call a logger in a callback: a variadic logger (Console.*, console.*, Effect.log*) handed point-free to a callback that is passed an index prints the index after each line.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const bindings = nameBindings(ctx);
    return {
      CallExpression: (node: ESTree.CallExpression) => {
        if (!passesIndex(bindings, node)) return Effect.void;
        return Effect.forEach(
          node.arguments.flatMap((argument) =>
            Option.toArray(loggerOf(bindings, argument)).map((name) => ({ argument, name })),
          ),
          ({ argument, name }) =>
            ctx.report(
              Diagnostic.make({
                node: argument,
                message: `${name} passed point-free: it is variadic, and this call passes the index too, which it prints after each line. Write (line) => ${name}(line).`,
              }),
            ),
          { discard: true },
        );
      },
    };
  },
});

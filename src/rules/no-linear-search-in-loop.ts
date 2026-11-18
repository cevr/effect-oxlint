/**
 * No linear search inside a loop over another collection: index the searched
 * collection once.
 *
 * Reported: `ys.find(…)`, `findIndex`, `findLast`, `findLastIndex`, `some`
 * or `filter` whose callback compares (`===`, `==`) a value of its element
 * with a value of the enclosing loop's element, inside a loop over another
 * collection (a `for…of` body, or the callback of `xs.map`, `forEach`,
 * `filter`, `flatMap`, `reduce`, `some`, `every`, `find`, `findIndex`).
 * Also reported: `ys.includes(v)`, `indexOf` or `lastIndexOf` with a value
 * read from the loop element, when `ys` is known to be an array.
 * Not reported: a loop over an array literal (a fixed, small count), a
 * search of an array literal or an UPPER_CASE constant (`["a", "b"].includes(x)`,
 * `KINDS.includes(x)`: a fixed, small table), a searched collection built
 * inside the loop, and test modules. The
 * search then runs once per outer element: n × m comparisons where a `Map`
 * or `Set` built once costs n + m. Counted cost: `tests/perf/no-linear-search-in-loop.ts`.
 * Source: the react skill, `performance.md` "Use Map/Set for lookups";
 * vercel `js-index-maps` (catalog SR-P01).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { contains, isFunction, walk } from "./_anti-slop-effect.js";
import {
  arrayMethodTarget,
  isKnownArrayExpression,
  unwrapArrayExpression,
} from "./_anti-slop-array-method.js";
import { enclosingLoop, patternNames } from "./_loops.js";
import type { Loop } from "./_loops.js";
import { isTestModule, skipFile } from "./_test-files.js";

const searchMethods: ReadonlySet<string> = new Set([
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
  "some",
  "filter",
]);

/** Searches by value; reported only on a receiver known to be an array (a string has `includes` too). */
const valueSearchMethods: ReadonlySet<string> = new Set(["includes", "indexOf", "lastIndexOf"]);

const readsAny = (node: ESTree.Node, names: ReadonlySet<string>): boolean =>
  contains(node, (child) => child.type === "Identifier" && names.has(child.name));

/** Names bound by declarations inside a loop: a collection built there is new each step. */
const declaredIn = (loop: ESTree.Node): ReadonlySet<string> => {
  const names = new Set<string>();
  walk(loop, (node) => {
    if (node.type === "VariableDeclarator")
      patternNames(node.id).forEach((name) => names.add(name));
    return true;
  });
  return names;
};

/** A loop over an array literal (`for (const k of ["a", "b"])`): a fixed, small count. */
const isFixedCollection = (loop: Loop): boolean =>
  Option.exists(
    loop.collection,
    (collection) => unwrapArrayExpression(collection).type === "ArrayExpression",
  );

/** A searched array literal or UPPER_CASE constant: a fixed table written in the source. */
const isFixedTable = (searched: ESTree.Node): boolean => {
  const node = unwrapArrayExpression(searched);
  return (
    node.type === "ArrayExpression" ||
    (node.type === "Identifier" && /^[A-Z][A-Z0-9_]*$/u.test(node.name))
  );
};

/** Whether a callback compares one of its parameters with one of `outer`. */
const comparesKeys = (callback: ESTree.Node, outer: ReadonlySet<string>): boolean => {
  if (!isFunction(callback)) return false;
  const inner = new Set(callback.params.flatMap(patternNames));
  if (inner.size === 0) return false;
  return contains(callback.body ?? callback, (node) => {
    if (node.type !== "BinaryExpression" || (node.operator !== "===" && node.operator !== "==")) {
      return false;
    }
    return (
      (readsAny(node.left, inner) && readsAny(node.right, outer)) ||
      (readsAny(node.right, inner) && readsAny(node.left, outer))
    );
  });
};

/** Whether a value search looks up a value read from the loop's element. */
const looksUpElement = (argument: ESTree.Node, outer: ReadonlySet<string>): boolean =>
  !isFunction(argument) && readsAny(argument, outer);

export const noLinearSearchInLoop = Rule.define({
  name: "no-linear-search-in-loop",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Index a collection once (Map or Set) instead of searching it inside a loop over another collection.",
    docs: { recommended: false, preset: "skills-perf" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    /** Whether the call searches by the loop's element: a keyed callback, or a value on a known array. */
    const searchesByElement = (
      call: ESTree.CallExpression,
      method: { readonly name: string; readonly object: ESTree.Node },
      outer: ReadonlySet<string>,
    ): boolean => {
      const argument = call.arguments[0] ?? call;
      if (searchMethods.has(method.name)) return comparesKeys(argument, outer);
      return (
        valueSearchMethods.has(method.name) &&
        looksUpElement(argument, outer) &&
        isKnownArrayExpression(ctx.sourceCode, unwrapArrayExpression(method.object))
      );
    };
    return {
      CallExpression: (node: ESTree.CallExpression) =>
        Option.match(
          Option.flatMap(arrayMethodTarget(node.callee), (method) => {
            return Option.flatMap(enclosingLoop(node), (loop) => {
              const outerText = Option.map(loop.collection, (c) => ctx.sourceCode.getText(c));
              const searched = ctx.sourceCode.getText(method.object);
              const skipped =
                Option.contains(outerText, searched) ||
                isFixedCollection(loop) ||
                isFixedTable(method.object) ||
                readsAny(method.object, loop.elementNames) ||
                readsAny(method.object, declaredIn(loop.node)) ||
                !searchesByElement(node, method, loop.elementNames);
              if (skipped) return Option.none();
              return Option.some({ method: method.name, searched });
            });
          }),
          {
            onNone: () => Effect.void,
            onSome: ({ method, searched }) =>
              ctx.report(
                Diagnostic.make({
                  node,
                  message: `\`${searched}.${method}(…)\` runs once per element of the enclosing loop, so the work is n × m comparisons and grows with the square of the data. Index \`${searched}\` once before the loop (\`const byKey = new Map(${searched}.map((item) => [item.key, item]))\`, or a \`Set\` of keys) and read \`byKey.get(key)\` inside it.`,
                }),
              ),
          },
        ),
    };
  },
});

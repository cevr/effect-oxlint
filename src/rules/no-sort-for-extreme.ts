/**
 * Do not sort a collection to take its first or last element: one pass finds
 * the minimum or maximum.
 *
 * Reported: `xs.sort(…)[0]`, `xs.toSorted(…)[0]`, and `.at(0)` or `.at(-1)`
 * on a `sort` or `toSorted` result (also behind a copy such as
 * `[...xs].sort(…)`), outside test modules. Sorting costs n log n comparisons (and a copy) where a
 * loop costs n. Counted cost: `tests/perf/no-sort-for-extreme.ts`. Source: the
 * react skill, `performance.md` "Loop for min/max, not sort"; vercel
 * `js-min-max-loop` (catalog SR-P02).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { arrayMethodTarget, unwrapArrayExpression } from "./_anti-slop-array-method.js";
import { isTestModule, skipFile } from "./_test-files.js";

const sorts: ReadonlySet<string> = new Set(["sort", "toSorted"]);

/** The sort method a node calls, when it is `….sort(…)` or `….toSorted(…)`. */
const sortCall = (node: ESTree.Node): Option.Option<string> => {
  const call = unwrapArrayExpression(node);
  if (call.type !== "CallExpression") return Option.none();
  return Option.filter(
    Option.map(arrayMethodTarget(call.callee), (method) => method.name),
    (name) => sorts.has(name),
  );
};

const isNumber = (node: ESTree.Node, value: number): boolean => {
  if (node.type === "Literal") return node.value === value;
  return (
    node.type === "UnaryExpression" &&
    node.operator === "-" &&
    node.argument.type === "Literal" &&
    node.argument.value === -value
  );
};

/** `sorted[0]`, or `sorted.at(0)` / `sorted.at(-1)`: the end taken from a sort, as the sort's name. */
const extremeOfSort = (node: ESTree.Node): Option.Option<string> => {
  if (node.type === "MemberExpression" && node.computed && isNumber(node.property, 0)) {
    return sortCall(node.object);
  }
  if (node.type !== "CallExpression") return Option.none();
  const atEnd = Option.exists(
    Option.fromNullishOr(node.arguments[0]),
    (index) => isNumber(index, 0) || isNumber(index, -1),
  );
  if (!atEnd) return Option.none();
  return Option.flatMap(arrayMethodTarget(node.callee), (method) => {
    if (method.name !== "at") return Option.none();
    return sortCall(method.object);
  });
};

export const noSortForExtreme = Rule.define({
  name: "no-sort-for-extreme",
  meta: Rule.meta({
    type: "suggestion",
    description: "Find a minimum or maximum in one pass instead of sorting to take one end.",
    docs: { recommended: false, preset: "skills-perf" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    const check = (node: ESTree.Node) =>
      Option.match(extremeOfSort(node), {
        onNone: () => Effect.void,
        onSome: (sort) =>
          ctx.report(
            Diagnostic.make({
              node,
              message: `\`${sort}\` orders every element (n log n comparisons, and a copy for \`toSorted\` or a spread) to read one end. Find it in one pass: \`let best = xs[0]; for (const x of xs) if (better(x, best)) best = x\`, or \`xs.reduce((best, x) => (better(x, best) ? x : best))\`.`,
            }),
          ),
      });
    return {
      MemberExpression: (node: ESTree.MemberExpression) => check(node),
      CallExpression: (node: ESTree.CallExpression) => check(node),
    };
  },
});

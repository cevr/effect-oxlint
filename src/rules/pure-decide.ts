/**
 * An aggregate's `decide` is pure: time comes from `now`, never from the host.
 *
 * Reported: inside a `decide` handler of an `@alchemy.run/domain` aggregate
 * (`Domain.Aggregate(name, { decide: { … } })`), a read of the clock or of
 * randomness, or I/O: `Date.now()`, `new Date()` with no argument,
 * `performance.now()`, `Math.random()`, `crypto.randomUUID()`,
 * `crypto.getRandomValues()`, any `Clock.…` or `Random.…` member, and
 * `fetch(…)`. A replayed or tested command must decide the same events;
 * these make it depend on when and where it ran. Source: alchemy-domain
 * building-blocks "decide reads time from `now` (its third argument)… Never
 * `Date.now()`, `Clock` or randomness" (catalog SR-D01). The transitive form
 * (a helper that reads the clock) needs a module graph and is not reported.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { walk } from "./_anti-slop-effect.js";
import { buildingBlockOf, domainImports, sectionOf } from "./_domain.js";

const impureMembers: ReadonlySet<string> = new Set([
  "Date.now",
  "performance.now",
  "Math.random",
  "crypto.randomUUID",
  "crypto.getRandomValues",
]);
const impureModules: ReadonlySet<string> = new Set(["Clock", "Random"]);

const memberText = (callee: ESTree.Node): Option.Option<readonly [string, string]> => {
  const named =
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.property.type === "Identifier";
  if (!named || callee.type !== "MemberExpression") return Option.none();
  if (callee.object.type !== "Identifier" || callee.property.type !== "Identifier") {
    return Option.none();
  }
  return Option.some([callee.object.name, callee.property.name] as const);
};

/** Whether a node reads the clock, randomness or the network. */
const isImpure = (node: ESTree.Node): boolean => {
  if (node.type === "NewExpression") {
    return (
      node.callee.type === "Identifier" &&
      node.callee.name === "Date" &&
      node.arguments.length === 0
    );
  }
  if (node.type === "MemberExpression") {
    return Option.exists(memberText(node), ([object]) => impureModules.has(object));
  }
  if (node.type !== "CallExpression") return false;
  if (node.callee.type === "Identifier") return node.callee.name === "fetch";
  return Option.exists(memberText(node.callee), ([object, property]) =>
    impureMembers.has(`${object}.${property}`),
  );
};

export const pureDecide = Rule.define({
  name: "pure-decide",
  meta: Rule.meta({
    type: "problem",
    description:
      "Keep an aggregate's decide pure: read time from its now argument, never the clock, randomness or I/O.",
    docs: { recommended: false, preset: "skills-domain" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const impureIn = (program: ESTree.Program): ReadonlyArray<ESTree.Node> => {
      const imports = domainImports(program);
      if (imports.namespaces.size === 0 && imports.named.size === 0) return [];
      const found: Array<ESTree.Node> = [];
      walk(program, (node) => {
        if (node.type !== "CallExpression") return true;
        if (!Option.contains(buildingBlockOf(imports, node), "Aggregate")) return true;
        for (const handler of sectionOf(node, "decide")) {
          walk(handler, (child) => {
            if (isImpure(child)) found.push(child);
            return true;
          });
        }
        return true;
      });
      return found;
    };
    return {
      Program: (program: ESTree.Program) =>
        Effect.forEach(
          impureIn(program),
          (node) =>
            ctx.report(
              Diagnostic.make({
                node,
                message: `\`${ctx.sourceCode.getText(node)}\` reads the clock, randomness or the network inside \`decide\`, so a replay or a story decides different events than the first run. Take the time from \`decide\`'s third argument (\`(state, cmd, now) => [new Published({ at: now })]\`) and ids or random values from the command's input.`,
              }),
            ),
          { discard: true },
        ),
    };
  },
});

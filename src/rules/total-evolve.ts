/**
 * `evolve` and `reply` are total: they apply a recorded event, they never refuse.
 *
 * Reported: inside an `evolve` or `reply` handler of an `@alchemy.run/domain`
 * aggregate or view (`Domain.Aggregate(…)`, `Domain.View(…)`), a `throw`,
 * an `Effect.fail…` or `Effect.die…` call, a `yield*`, or `new X(…)` of a
 * rejection (a class this file declares with `Domain.Rejection(…)`, or one
 * imported from a `*.rejection` module). The event is already recorded:
 * `decide` refused the command or it did not; a handler that fails now
 * leaves a stream no replay can fold. Keep any state the event cannot follow
 * (`s._tag === "Open" ? { ...s, balance: e.balanceAfter } : s`). Source:
 * alchemy-domain building-blocks "evolve and reply are total and never fail"
 * (catalog SR-D02).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { walk } from "./_anti-slop-effect.js";
import { buildingBlockOf, domainImports, sectionOf } from "./_domain.js";
import type { DomainImports } from "./_domain.js";

const blocks: ReadonlySet<string> = new Set(["Aggregate", "View"]);
const sections = ["evolve", "reply"] as const;
const rejectionModule = /\.rejection(?:\.[cm]?[jt]sx?)?$/u;

/** Names of rejection classes: declared here with `Domain.Rejection(…)`, or imported from a `*.rejection` module. */
const rejectionsIn = (program: ESTree.Program, imports: DomainImports): ReadonlySet<string> => {
  const names = new Set<string>();
  for (const statement of program.body) {
    if (
      statement.type === "ImportDeclaration" &&
      rejectionModule.test(`${statement.source.value}`)
    ) {
      statement.specifiers.forEach((specifier) => names.add(specifier.local.name));
    }
  }
  walk(program, (node) => {
    const declared =
      (node.type === "ClassDeclaration" || node.type === "ClassExpression") &&
      Option.isSome(Option.fromNullishOr(node.id)) &&
      Option.exists(Option.fromNullishOr(node.superClass), (superClass) => {
        if (superClass.type !== "CallExpression") return false;
        return Option.contains(buildingBlockOf(imports, superClass), "Rejection");
      });
    if (
      declared &&
      (node.type === "ClassDeclaration" || node.type === "ClassExpression") &&
      node.id
    ) {
      names.add(node.id.name);
    }
    return true;
  });
  return names;
};

const effectFailure = /^(?:fail|die)/u;

/** Whether a node refuses or fails inside a handler that must be total. */
const fails = (node: ESTree.Node, rejections: ReadonlySet<string>): boolean => {
  if (node.type === "ThrowStatement") return true;
  if (node.type === "YieldExpression") return node.delegate;
  if (node.type === "NewExpression") {
    return node.callee.type === "Identifier" && rejections.has(node.callee.name);
  }
  if (node.type !== "CallExpression") return false;
  const callee = node.callee;
  return (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.object.name === "Effect" &&
    callee.property.type === "Identifier" &&
    effectFailure.test(callee.property.name)
  );
};

export const totalEvolve = Rule.define({
  name: "total-evolve",
  meta: Rule.meta({
    type: "problem",
    description:
      "Keep evolve and reply total: no throw, no failure, no rejection; keep any state the event cannot follow.",
    docs: { recommended: false, preset: "skills-domain" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const failuresIn = (program: ESTree.Program): ReadonlyArray<ESTree.Node> => {
      const imports = domainImports(program);
      if (imports.namespaces.size === 0 && imports.named.size === 0) return [];
      const rejections = rejectionsIn(program, imports);
      const found: Array<ESTree.Node> = [];
      walk(program, (node) => {
        if (node.type !== "CallExpression") return true;
        const isBlock = Option.exists(buildingBlockOf(imports, node), (block) => blocks.has(block));
        if (!isBlock) return true;
        for (const section of sections) {
          for (const handler of sectionOf(node, section)) {
            walk(handler, (child) => {
              if (fails(child, rejections)) found.push(child);
              return true;
            });
          }
        }
        return true;
      });
      return found;
    };
    return {
      Program: (program: ESTree.Program) =>
        Effect.forEach(
          failuresIn(program),
          (node) =>
            ctx.report(
              Diagnostic.make({
                node,
                message:
                  'This `evolve` or `reply` handler can fail, but its event is already recorded: a replay that reaches it cannot fold the stream. Refuse in `decide` instead, and here keep any state the event cannot follow: `(s, e) => (s._tag === "Open" ? { ...s, balance: e.balanceAfter } : s)`.',
              }),
            ),
          { discard: true },
        ),
    };
  },
});

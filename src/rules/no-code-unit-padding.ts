/**
 * Fit text to a column by its display width, not by `padStart`/`padEnd`.
 *
 * `padStart` and `padEnd` count UTF-16 code units. A wide character (CJK, most
 * emoji) takes two terminal columns in one or two code units, a combining mark
 * takes none, and an astral character takes one column in two code units, so
 * a padded column of names or labels drifts as soon as one of them is not
 * ASCII. Pad by display width instead (`Bun.stringWidth`, `string-width`, or
 * the project's own width helper).
 *
 * The rule cannot see types, so it reads the receiver's syntax: a number
 * rendered with `String(n)`, `n.toString(…)`, `n.toFixed(…)`,
 * `n.toPrecision(…)` or `n.toExponential(…)` is ASCII, and its padding is
 * allowed. Every other receiver is reported.
 *
 * Opt-in: where display width matters (a terminal UI, a CLI table) is a
 * project's decision, so a project enables the rule for those files with an
 * override.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { staticMemberName } from "./_global-values.js";

const paddings = new Set(["padStart", "padEnd"]);
const numberRenderings = new Set(["toString", "toFixed", "toPrecision", "toExponential"]);

/** `String(n)` or `n.toString(…)` and its siblings: a number rendered as ASCII. */
const isNumberRendering = (node: ESTree.Expression): boolean => {
  if (node.type === "ParenthesizedExpression") return isNumberRendering(node.expression);
  if (node.type !== "CallExpression" || node.callee.type === "Super") return false;
  const callee = node.callee;
  if (callee.type === "Identifier") return callee.name === "String";
  if (callee.type !== "MemberExpression") return false;
  return Option.exists(staticMemberName(callee), (name) => numberRenderings.has(name));
};

export const noCodeUnitPadding = Rule.define({
  name: "no-code-unit-padding",
  meta: Rule.meta({
    type: "problem",
    description:
      "Pad text by display width: padStart and padEnd count UTF-16 code units, so wide and combining characters misalign a column.",
    docs: { recommended: false },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    return {
      MemberExpression: (node: ESTree.MemberExpression) => {
        const name = staticMemberName(node);
        if (!Option.exists(name, (member) => paddings.has(member))) return Effect.void;
        if (node.object.type === "Super" || isNumberRendering(node.object)) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message: `${Option.getOrElse(name, () => "padEnd")} counts UTF-16 code units, not display columns: a wide, combining or emoji character misaligns the column. Pad by display width; padding is safe on a number rendered with String() or toString().`,
          }),
        );
      },
    };
  },
});

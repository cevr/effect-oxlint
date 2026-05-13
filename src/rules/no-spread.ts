/**
 * Ban spread syntax.
 *
 * Prefer explicit construction/transformation so value boundaries stay visible.
 */
import type { ESTree } from "@oxlint/plugins";
import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";

const message = "Avoid spread syntax. Use explicit construction or a named transformation instead.";

export const noSpread = Rule.define({
  name: "no-spread",
  meta: Rule.meta({
    type: "suggestion",
    description: message,
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const reportSpread = (node: ESTree.Node) =>
      ctx.report(
        Diagnostic.make({
          node,
          message,
        }),
      );

    return {
      SpreadElement: reportSpread,
      JSXSpreadAttribute: reportSpread,
    };
  },
});

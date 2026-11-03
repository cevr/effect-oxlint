/**
 * Ban comments. Code says what it does through its names and types; a
 * suppression carries its reason after ` -- `; history belongs in the commit
 * message and a rule in a lint rule or a type. Comments that instruct a tool
 * (suppressions, `@ts-*`, `@effect-diagnostics`, triple-slash references,
 * bundler annotations, JSX pragmas, formatter and coverage ignores) stay.
 */
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isToolDirective } from "./_comment-directives.js";

export const noComments = Rule.define({
  name: "no-comments",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Ban comments other than tool directives: name the code instead, and put reasons in suppressions, history in commits, and rules in lint rules or types.",
    messages: {
      comment:
        "Comments are not allowed. Say it in a name or a type, give a suppression its reason after ` -- `, put history in the commit message, and turn a rule into a lint rule.",
    },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    return {
      Program: () =>
        Effect.forEach(
          ctx.sourceCode
            .getAllComments()
            .filter((comment) => comment.type !== "Shebang" && !isToolDirective(comment.value)),
          (comment) => ctx.report(Diagnostic.fromId({ node: comment, messageId: "comment" })),
          { discard: true },
        ),
    };
  },
});

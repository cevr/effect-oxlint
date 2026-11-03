/**
 * Ban comments. Code says what it does through its names and types; a
 * suppression carries its reason after ` -- `; history belongs in the commit
 * message and a rule in a lint rule or a type. Comments that instruct a tool
 * (suppressions, `@ts-*`, `@effect-diagnostics`, triple-slash references,
 * bundler annotations, JSX pragmas, formatter and coverage ignores) stay.
 */
import type { Comment } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isToolDirective } from "./_comment-directives.js";

const isBlank = (text: string) => /^[\t ]*$/u.test(text);

/**
 * The range to delete with a comment: its whole line when it stands alone,
 * the space before it when it trails code, and one space beside it when it
 * sits between tokens.
 */
const removalRange = (text: string, comment: Comment): [number, number] => {
  const [start, end] = comment.range;
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const newline = text.indexOf("\n", end);
  let lineEnd = text.length;
  let nextLine = text.length;
  if (newline !== -1) {
    lineEnd = newline;
    nextLine = newline + 1;
  }
  const before = text.slice(lineStart, start);
  const after = text.slice(end, lineEnd);
  if (isBlank(before) && isBlank(after)) return [lineStart, nextLine];
  if (isBlank(after)) return [lineStart + before.trimEnd().length, lineEnd];
  if (text[end] === " ") return [start, end + 1];
  if (text[start - 1] === " ") return [start - 1, end];
  return [start, end];
};

export const noComments = Rule.define({
  name: "no-comments",
  meta: Rule.meta({
    type: "suggestion",
    fixable: "code",
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
          (comment) =>
            ctx.report(
              Diagnostic.withFix(
                Diagnostic.fromId({ node: comment, messageId: "comment" }),
                (fixer) => fixer.removeRange(removalRange(ctx.sourceCode.text, comment)),
              ),
            ),
          { discard: true },
        ),
    };
  },
});

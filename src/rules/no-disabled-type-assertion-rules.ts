/**
 * The never-disable list: the rules that keep type assertions out may not be
 * disabled by an inline comment.
 *
 * An inline disable of any of them lets one cast through with no review; a
 * file override in the lint config, with its reason beside it, stays the way
 * to exempt code. The list is the type-assertion rules this plugin and oxlint
 * ship, this rule itself, and any `additionalRules` a project names. A disable
 * that names no rule at all is `require-suppression-reason`'s `missingTarget`.
 * Ported from K-Mistele/anti-slop (`no-disabled-type-assertion-rules`,
 * b7c1619, MIT; THIRD_PARTY_NOTICES.md).
 */
import type { Comment } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";

const defaultRules: ReadonlyArray<string> = [
  "effect/noAs",
  "effect/noChainedTypeAssertions",
  "effect/noDisabledTypeAssertionRules",
  "effect/noWidenThenAssert",
  "typescript/consistent-type-assertions",
  "typescript/no-unsafe-type-assertion",
];

const NoDisabledTypeAssertionRulesOptions = Schema.UndefinedOr(
  Schema.Struct({ additionalRules: Schema.optionalKey(Schema.Array(Schema.String)) }),
);

const disablePattern = /^\s*(?:oxlint|eslint)-disable(?:-next-line|-line)?(?=\s|$)(?<list>.*)$/su;

/** `@typescript-eslint/x` reads as `typescript/x`; an `effect/` rule matches kebab or camel case. */
const normalizeRuleName = (rule: string): string => {
  const name = rule.trim().replace(/^@?typescript-eslint\//u, "typescript/");
  if (!name.startsWith("effect/")) return name;
  return name.replaceAll(/-(?<letter>[a-z])/gu, (_match, letter: string) => letter.toUpperCase());
};

/** The rules a disable comment lists; none when it is not a disable directive. */
const disabledRules = (value: string): ReadonlyArray<string> => {
  const list = disablePattern.exec(value)?.groups?.["list"] ?? "";
  const targets = list.split(/\s--(?:\s|$)/u).at(0) ?? "";
  return targets
    .split(",")
    .map(normalizeRuleName)
    .filter((rule) => rule.length > 0);
};

export const noDisabledTypeAssertionRules = Rule.define({
  name: "no-disabled-type-assertion-rules",
  meta: Rule.meta({
    type: "problem",
    description:
      "Disallow inline disable comments for the rules that keep type assertions out (the never-disable list).",
    schema: [
      {
        type: "object",
        properties: {
          additionalRules: {
            type: "array",
            items: { type: "string", minLength: 1 },
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ additionalRules: [] }],
  }),
  options: NoDisabledTypeAssertionRulesOptions,
  create: function* (options) {
    const ctx = yield* RuleContext;
    const guarded = new Set([
      ...defaultRules,
      ...(options?.additionalRules ?? []).map(normalizeRuleName),
    ]);
    const checkComment = (comment: Comment) =>
      Effect.forEach(
        disabledRules(comment.value).filter((rule) => guarded.has(rule)),
        (rule) =>
          ctx.report(
            Diagnostic.make({
              node: comment,
              message: `\`${rule}\` keeps type assertions out and may not be disabled inline: the comment lets a cast through with no review. Remove the cast (decode with Schema, narrow with a guard), or exempt the file with an override in the lint config that gives its reason.`,
            }),
          ),
        { discard: true },
      );
    return {
      Program: () =>
        Effect.forEach(
          ctx.sourceCode.getAllComments().filter((comment) => comment.type !== "Shebang"),
          checkComment,
          { discard: true },
        ),
    };
  },
});

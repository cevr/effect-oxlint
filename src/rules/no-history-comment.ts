/**
 * A comment says what the code does today and why.
 *
 * How the code got here (the commit that fixed it, what it did before) is
 * history: it lives in `git log`, and a comment that tells it goes stale
 * while the code it sits on stays true.
 *
 * Refused in a comment, in any project: a commit hash (7 to 40 hex digits
 * holding a digit and a letter, not a `#` colour or part of a longer word)
 * and "used to" after a word that is not a form of `be` or `get` ("is used
 * to rank" passes, and so does a sentence that opens with it).
 *
 * A project adds the forms its own history takes with `patterns`, each a
 * regular expression and what to call it in the report (a loop's pass
 * numbers, its batch ids, the ids of a ledger), and names where its history
 * lives with `history` ("the ledger and git log"; `git log` by default):
 *
 * ```json
 * ["error", {
 *   "history": "the ledger and git log",
 *   "patterns": [{ "what": "a pass number", "pattern": "\\bpass(?:es)?[ -]\\d+\\b", "flags": "i" }]
 * }]
 * ```
 *
 * Only these forms are seen: a comment that tells history in other words
 * is a reviewer's to find.
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";

/** A project's own form of history: a pattern, its `flags` besides `g` and `u`, and what the report calls it. */
const Pattern = Schema.Struct({
  what: Schema.String,
  pattern: Schema.String,
  flags: Schema.optionalKey(Schema.String),
});

const Options = Schema.UndefinedOr(
  Schema.Struct({
    history: Schema.optionalKey(Schema.String),
    patterns: Schema.optionalKey(Schema.Array(Pattern)),
  }),
);

/** A form of words that tells history, and what to call it in the report. */
interface Tell {
  readonly what: string;
  readonly pattern: RegExp;
}

const builtIn: ReadonlyArray<Tell> = [
  {
    what: "a commit hash",
    pattern: /(?<![#\w-])(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}(?![\w-])/gu,
  },
  {
    what: '"used to"',
    pattern:
      /(?<=\b[A-Za-z][\w']*\s)(?<!\b(?:is|are|was|were|be|been|being|get|gets|got)\s)used to\b/gu,
  },
];

/** A configured pattern as a global, unicode expression with its own flags. */
const tellOf = (configured: typeof Pattern.Type): Tell => ({
  what: configured.what,
  pattern: new RegExp(configured.pattern, `gu${(configured.flags ?? "").replaceAll(/[gu]/gu, "")}`),
});

/** Where a comment's text starts in the file: past its `//` or `/*`. */
const opener = 2;

export const noHistoryComment = Rule.define({
  name: "no-history-comment",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Say in a comment what the code does today and why; how it got here (a commit, what it used to do, a project's own history forms) lives in git log.",
    docs: { recommended: false },
    schema: [
      {
        type: "object",
        properties: {
          history: { type: "string" },
          patterns: {
            type: "array",
            items: {
              type: "object",
              properties: {
                what: { type: "string" },
                pattern: { type: "string" },
                flags: { type: "string" },
              },
              required: ["what", "pattern"],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ history: "git log", patterns: [] }],
  }),
  options: Options,
  create: function* (options) {
    const ctx = yield* RuleContext;
    const history = options?.history ?? "git log";
    const tells = [...builtIn, ...(options?.patterns ?? []).map(tellOf)];

    /** Each tell in a comment's text, in the order it is written: where it starts, how long it is, and what it is. */
    const tellsIn = (text: string) =>
      tells
        .flatMap(({ what, pattern }) =>
          Array.from(text.matchAll(pattern), (match) => ({
            at: match.index,
            length: match[0].length,
            what,
          })),
        )
        .toSorted((a, b) => a.at - b.at);

    return {
      Program: () =>
        Effect.forEach(
          ctx.sourceCode.getAllComments().filter((comment) => comment.type !== "Shebang"),
          (comment) =>
            Effect.forEach(
              tellsIn(comment.value),
              ({ at, length, what }) => {
                const start = comment.range[0] + opener + at;
                return ctx.report(
                  Diagnostic.make({
                    node: { range: [start, start + length] },
                    message: `${what} in a comment tells history: say what the code does today and why; how it got here lives in ${history}.`,
                  }),
                );
              },
              { discard: true },
            ),
          { discard: true },
        ),
    };
  },
});

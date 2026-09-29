/** Require every lint and type-check suppression to name its target and give a reason. */
import type { Comment } from "@oxlint/plugins";
import * as Effect from "effect/Effect";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";

type DirectiveKind = "effect-diagnostics" | "lint" | "typescript";

interface Directive {
  readonly kind: DirectiveKind;
  readonly name: string;
  readonly targets: ReadonlyArray<string>;
  readonly reason: string;
}

interface Finding {
  readonly messageId: "effectPrefix" | "missingReason" | "missingTarget";
  readonly data: Readonly<Record<string, string>>;
}

/**
 * A directive at the start of a comment line, after any JSDoc `*` gutter.
 * The rules and reason run to the next directive or the end of the comment.
 */
const directivePattern =
  /(?:^|\n)[\t *]*(?<name>(?:oxlint|eslint)-disable(?:-next-line|-line)?|@effect-diagnostics(?:-next-line)?|@ts-(?:expect-error|ignore|nocheck))(?=$|[\s:])/gu;

/** ESLint-style reason separator: `--` with whitespace on both sides. */
const reasonSeparator = /\s--\s/u;

const kindOf = (name: string): DirectiveKind => {
  if (name.startsWith("@ts-")) return "typescript";
  if (name.startsWith("@effect-diagnostics")) return "effect-diagnostics";
  return "lint";
};

const parseDirectives = (value: string): ReadonlyArray<Directive> => {
  const matches = [...value.matchAll(directivePattern)];
  return matches.map((match, index) => {
    const name = match.groups?.["name"] ?? "";
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? value.length;
    const body = value
      .slice(start, end)
      .replaceAll(/\n[\t *]*/gu, " ")
      .trim();
    const padded = ` ${body} `;
    const separator = padded.search(reasonSeparator);
    let targetText = padded;
    let reason = "";
    if (separator !== -1) {
      targetText = padded.slice(0, separator);
      reason = padded.slice(separator + 4);
    }
    return {
      kind: kindOf(name),
      name,
      targets: targetText.split(/[\s,]+/u).filter((target) => target.length > 0),
      reason: reason.trim(),
    };
  });
};

const checkDirective = (directive: Directive): ReadonlyArray<Finding> => {
  const findings: Array<Finding> = [];
  if (directive.kind !== "typescript" && directive.targets.length === 0) {
    let example = "ruleName:off";
    if (directive.kind === "lint") example = "rule-name";
    findings.push({ messageId: "missingTarget", data: { directive: directive.name, example } });
  }
  if (directive.kind === "effect-diagnostics") {
    for (const target of directive.targets) {
      if (!target.startsWith("effect/")) continue;
      findings.push({
        messageId: "effectPrefix",
        data: { target, bare: target.slice("effect/".length) },
      });
    }
  }
  if (directive.reason.length === 0) {
    findings.push({ messageId: "missingReason", data: { directive: directive.name } });
  }
  return findings;
};

export const requireSuppressionReason = Rule.define({
  name: "require-suppression-reason",
  meta: Rule.meta({
    type: "problem",
    description:
      "Require oxlint, ESLint, Effect diagnostics, and TypeScript suppressions to name what they disable and give a reason after ` -- `.",
    messages: {
      missingTarget:
        "`{{directive}}` must name what it disables, for example `{{directive}} {{example}} -- reason`. A blanket suppression hides every future finding on the code it covers.",
      missingReason:
        "`{{directive}}` needs a reason after ` -- ` that says why the check does not apply here, so a reader can tell when the suppression can be removed.",
      effectPrefix:
        "`@effect-diagnostics` ignores `{{target}}`: @effect/tsgo does not accept the `effect/` prefix. Write the bare rule name, `{{bare}}`.",
    },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const checkComment = (comment: Comment) =>
      Effect.forEach(
        parseDirectives(comment.value).flatMap(checkDirective),
        (finding) =>
          ctx.report(
            Diagnostic.fromId({ node: comment, messageId: finding.messageId, data: finding.data }),
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

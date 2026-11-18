/**
 * A typed failure in Effect code is a `Schema.TaggedError` class.
 *
 * Reported, in a non-test module that imports `effect` or an `@effect/…`
 * package: a class that extends `Error`, `TypeError` or `RangeError`; a class
 * that extends `Data.TaggedError` or `Data.Error` (unless
 * `allowDataTaggedError`); and a hand-written tagged class, one with a `_tag`
 * field and no `Schema`, `Data` or `Context` base, when it is a failure: its
 * name ends in `Error`, `Failure` or `Defect`, or it has a `message` field. A
 * service or a span with a `_tag` is not a failure. Source: the effect skill,
 * "Model typed Effect errors with `Schema.TaggedError`", "Do not hand-roll
 * `_tag` error classes" (catalog SR-E01).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { walk } from "./_anti-slop-effect.js";
import { isTestModule, skipFile } from "./_test-files.js";

const Options = Schema.UndefinedOr(
  Schema.Struct({ allowDataTaggedError: Schema.optionalKey(Schema.Boolean) }),
);

const nativeErrors: ReadonlySet<string> = new Set(["Error", "TypeError", "RangeError"]);
const failureName = /(?:Error|Failure|Defect)$/u;

type Form = "native" | "data" | "hand";

const importsEffect = (program: ESTree.Program): boolean =>
  program.body.some(
    (statement) =>
      statement.type === "ImportDeclaration" &&
      /^(?:effect(?:\/.*)?|@effect\/.+)$/u.test(statement.source.value),
  );

/** The names of a class body's fields and accessors. */
const memberNames = (node: ESTree.Class): ReadonlySet<string> => {
  const names = new Set<string>();
  for (const member of node.body.body) {
    if (member.type !== "PropertyDefinition" && member.type !== "MethodDefinition") continue;
    if (member.key.type === "Identifier") names.add(member.key.name);
  }
  return names;
};

export const requireSchemaTaggedError = Rule.define({
  name: "require-schema-tagged-error",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Declare typed Effect failures as Schema.TaggedError classes, not Error subclasses, Data.TaggedError or hand-written _tag classes.",
    docs: { recommended: false },
    schema: [
      {
        type: "object",
        properties: { allowDataTaggedError: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ allowDataTaggedError: false }],
  }),
  options: Options,
  create: function* (options) {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    const allowData = options?.allowDataTaggedError ?? false;

    const formOf = (node: ESTree.Class): Option.Option<Form> => {
      const base = Option.fromNullishOr(node.superClass);
      const baseText = Option.match(base, {
        onNone: () => "",
        onSome: (expression) => ctx.sourceCode.getText(expression),
      });
      if (Option.exists(base, (b) => b.type === "Identifier" && nativeErrors.has(b.name))) {
        return Option.some("native");
      }
      if (/^Data\.(?:TaggedError|Error)\b/u.test(baseText)) {
        if (allowData) return Option.none();
        return Option.some("data");
      }
      const members = memberNames(node);
      if (!members.has("_tag") || /^(?:Schema|Data|Context)\./u.test(baseText)) {
        return Option.none();
      }
      const name = Option.match(Option.fromNullishOr(node.id), {
        onNone: () => "",
        onSome: (id) => id.name,
      });
      if (failureName.test(name) || members.has("message")) return Option.some("hand");
      return Option.none();
    };

    const messages: Record<Form, string> = {
      native:
        'This failure extends a native `Error`, so Effect sees an untyped defect-shaped value: no tag to `catchTag` on, no schema to encode it across a boundary. Declare it as `class NoteMissing extends Schema.TaggedError<NoteMissing>()("NoteMissing", { id: NoteId }) {}` and fail with `yield* new NoteMissing({ id })`.',
      data: '`Data.TaggedError` gives a tag but no schema, so the failure cannot be encoded, decoded or shown in an API\'s error union. Declare it with `Schema.TaggedError<Self>()("Tag", { …fields })`; set `allowDataTaggedError` if the project chose `Data` on purpose.',
      hand: 'This class writes its own `_tag`, so its constructor, equality and encoding are hand-rolled and drift from the tag. Declare the failure with `Schema.TaggedError<Self>()("Tag", { …fields })`, which gives the tag, the constructor and the schema at once.',
    };

    const check = (node: ESTree.Class) =>
      Option.match(formOf(node), {
        onNone: () => Effect.void,
        onSome: (form) => ctx.report(Diagnostic.make({ node, message: messages[form] })),
      });

    return {
      Program: (program: ESTree.Program) => {
        if (!importsEffect(program)) return Effect.void;
        const classes: Array<ESTree.Class> = [];
        walk(program, (node) => {
          if (node.type === "ClassDeclaration" || node.type === "ClassExpression")
            classes.push(node);
          return true;
        });
        return Effect.forEach(classes, check, { discard: true });
      },
    };
  },
});

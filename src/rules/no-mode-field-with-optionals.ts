/**
 * A mode is a tagged union, not a mode field beside optional fields.
 *
 * Reported: an interface, a type literal or a `Schema.Struct({...})` with a
 * mode field (`status`, `state`, `type`, `kind`, `mode`, `phase` or `stage`)
 * whose type is a union of two or more string literals (`Schema.Literals`,
 * `Schema.Literal("a", "b")`, a union of `Schema.Literal`) and two or more
 * optional siblings (`?:`, `| undefined`, `| null`, `Schema.optional…`,
 * `Schema.NullOr`, `Schema.UndefinedOr`, `Schema.NullishOr`, `Schema.Option…`).
 * The optional fields are then present in some modes only, and nothing ties
 * them to the mode that has them.
 * Not reported (the four filters of the measured read): a type whose name
 * ends in `Props`; a type literal written in a parameter; a mode field that
 * is itself optional; a record with snake_case members or an
 * `object: "…"` literal member (a vendor's wire format). Test modules and
 * types declared outside the project (`node_modules`, `.d.ts` files) are
 * skipped. Source: effect `ARCHITECTURE.md` "Status strings and booleans
 * encoding modes → a lifecycle machine"; react `state-modeling.md` "Each
 * branch has exactly the fields it needs" (catalog SR-E10).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { ancestorsOf, isFunction } from "./_anti-slop-effect.js";
import { isTestModule, skipFile } from "./_test-files.js";

const modeField = /^(?:status|state|type|kind|mode|phase|stage)$/u;
const snakeCase = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/u;
const literalSchema = /^Schema\.(?:Literals\(\[|Literal\([^)]*,|Union\(\[?\s*Schema\.Literal)/u;
const optionalSchema = /^Schema\.(?:optional|optionalKey|NullOr|UndefinedOr|NullishOr|Option)/u;

/** One member of a record, read the same way for types and schemas. */
interface Member {
  readonly name: string;
  readonly isMode: boolean;
  readonly optional: boolean;
  /** `object: "…"` (or `Schema.Literal("…")`): a wire-format discriminator. */
  readonly isObjectLiteral: boolean;
}

const keyText = (key: ESTree.Node): Option.Option<string> => {
  if (key.type === "Identifier") return Option.some(key.name);
  if (key.type === "Literal" && Predicate.isString(key.value)) return Option.some(key.value);
  return Option.none();
};

const isStringLiteralType = (node: ESTree.Node): boolean =>
  node.type === "TSLiteralType" &&
  node.literal.type === "Literal" &&
  Predicate.isString(node.literal.value);

const isNullish = (node: ESTree.Node): boolean =>
  node.type === "TSNullKeyword" ||
  node.type === "TSUndefinedKeyword" ||
  (node.type === "TSLiteralType" && node.literal.type === "Literal" && Predicate.isNull(node.literal.value));

/** The members of a union type; none for another type. */
const unionMembers = (type: ESTree.Node): ReadonlyArray<ESTree.Node> => {
  if (type.type !== "TSUnionType") return [];
  return type.types;
};

const typeMember = (member: ESTree.Node): Option.Option<Member> => {
  if (member.type !== "TSPropertySignature") return Option.none();
  return Option.map(keyText(member.key), (name) => {
    const type = Option.map(Option.fromNullishOr(member.typeAnnotation), (a) => a.typeAnnotation);
    const unionTypes = Option.match(type, { onNone: () => [], onSome: unionMembers });
    return {
      name,
      isMode:
        modeField.test(name) && unionTypes.length >= 2 && unionTypes.every(isStringLiteralType),
      optional: member.optional === true || unionTypes.some(isNullish),
      isObjectLiteral: name === "object" && Option.exists(type, isStringLiteralType),
    };
  });
};

/** Whether a node sits in a function's parameter list. */
const inParameter = (node: ESTree.Node): boolean => {
  let child = node;
  for (const ancestor of ancestorsOf(node)) {
    if (isFunction(ancestor)) return ancestor.params.some((param) => param === child);
    child = ancestor;
  }
  return false;
};

/** The declared name of a record type: the interface's or the type alias's. */
const recordName = (node: ESTree.Node): Option.Option<string> => {
  if (node.type === "TSInterfaceDeclaration") return Option.some(node.id.name);
  const parent = node.parent;
  if (parent?.type === "TSTypeAliasDeclaration") return Option.some(parent.id.name);
  return Option.none();
};

const messages = {
  type: 'This record has a mode field and optional fields that only some modes fill, so a value can hold a field its mode never has and code must re-check the mode before each read. Make it a union of one record per mode: `type Job = { status: "queued" } | { status: "running"; attempt: number }`, each with exactly the fields that mode needs.',
  schema:
    'This struct has a mode field and optional fields that only some modes fill, so a value can hold a field its mode never has and code must re-check the mode before each read. Make it a union of one struct per mode: `Schema.Union([Schema.TaggedStruct("queued", {}), Schema.TaggedStruct("running", { attempt: Schema.Number })])`, each with exactly the fields that mode needs.',
} as const;

/**
 * A file that declares types the project does not own: anything under
 * `node_modules`, and a declaration file (`.d.ts`, `.d.mts`, `.d.cts`), which
 * describes a dependency's or a host's shapes rather than the project's model.
 */
const isExternalDeclaration = (filename: string): boolean => {
  const path = filename.replaceAll("\\", "/");
  return path.includes("/node_modules/") || /\.d\.[cm]?ts$/u.test(path);
};

/** Whether the members make the reported form, after the filters. */
const isModeRecord = (members: ReadonlyArray<Member>): boolean => {
  const wire = members.some(
    (member) => member.isObjectLiteral || snakeCase.test(member.name),
  );
  const mode = members.some((member) => member.isMode && !member.optional);
  const optional = members.filter((member) => !member.isMode && member.optional).length;
  return !wire && mode && optional >= 2;
};

export const noModeFieldWithOptionals = Rule.define({
  name: "no-mode-field-with-optionals",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Model a mode as a tagged union of one record per mode, not a mode field beside optional fields.",
    docs: { recommended: false },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx) || isExternalDeclaration(ctx.filename)) return skipFile;

    const schemaMember = (property: ESTree.Node): Option.Option<Member> => {
      if (property.type !== "Property") return Option.none();
      return Option.map(keyText(property.key), (name) => {
        const text = ctx.sourceCode.getText(property.value);
        return {
          name,
          isMode: modeField.test(name) && literalSchema.test(text),
          optional: optionalSchema.test(text),
          isObjectLiteral: name === "object" && /^Schema\.Literal\(\s*["'][^"',]*["']\s*\)$/u.test(text),
        };
      });
    };

    const report = (node: ESTree.Node, form: "schema" | "type") =>
      ctx.report(Diagnostic.make({ node, message: messages[form] }));

    const checkType = (node: ESTree.Node, body: ReadonlyArray<ESTree.Node>) => {
      const props = Option.exists(recordName(node), (name) => name.endsWith("Props"));
      if (props || inParameter(node)) return Effect.void;
      const members = body.flatMap((member) => Option.toArray(typeMember(member)));
      if (!isModeRecord(members)) return Effect.void;
      return report(node, "type");
    };

    return {
      TSInterfaceDeclaration: (node: ESTree.TSInterfaceDeclaration) =>
        checkType(node, node.body.body),
      TSTypeLiteral: (node: ESTree.TSTypeLiteral) => checkType(node, node.members),
      CallExpression: (node: ESTree.CallExpression) => {
        const argument = node.arguments[0];
        if (
          ctx.sourceCode.getText(node.callee) !== "Schema.Struct" ||
          argument?.type !== "ObjectExpression"
        ) {
          return Effect.void;
        }
        const members = argument.properties.flatMap((p) => Option.toArray(schemaMember(p)));
        if (!isModeRecord(members)) return Effect.void;
        return report(node, "schema");
      },
    };
  },
});

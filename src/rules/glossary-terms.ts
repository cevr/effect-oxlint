/**
 * Code uses the glossary's terms, not the words it says to avoid.
 *
 * Reported: a name this file declares (a variable, parameter, function,
 * class, type, interface, enum, member or property) whose words contain a
 * term from an `_Avoid_:` list of the project's glossary
 * (`glossary`, a path from the lint root, such as `"GLOSSARY.md"`). The
 * glossary format is the domain-modeling skill's: a `**Term**:` line, its
 * definition, then `_Avoid_: word, other word`. Words are compared in lower
 * case, split at camelCase, `_`, `-` and digits, so `buyerId`, `BUYER_ID`
 * and `client-name` are read as `buyer id`, `buyer id` and `client name`; a
 * term of two words (`payment request`) matches those two words in a row.
 * Imported names are someone else's and are left alone. With no `glossary`
 * the rule does nothing. Source: domain-modeling "Sharpen fuzzy language",
 * `GLOSSARY-FORMAT.md`; codebase-design "Use these terms exactly" (catalog
 * SR-D12).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { isFunction, walk } from "./_anti-slop-effect.js";

const Options = Schema.UndefinedOr(Schema.Struct({ glossary: Schema.optionalKey(Schema.String) }));

interface AvoidedTerm {
  /** The avoided words, lower case: `["payment", "request"]`. */
  readonly words: ReadonlyArray<string>;
  /** The glossary term to use instead. */
  readonly preferred: string;
}

/** The words of a name, lower case: `buyerID2_name` → buyer, id, 2, name. */
const wordsOf = (name: string): ReadonlyArray<string> =>
  Arr.map(name.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|[0-9]+/gu) ?? [], (word) => word.toLowerCase());

const termLine = /^\*\*(.+?)\*\*:/u;
const avoidLine = /^_Avoid_:\s*(.+)$/u;

/** The `_Avoid_` lists of a glossary in the domain-modeling format, each with its term. */
const avoidedTerms = (glossary: string): ReadonlyArray<AvoidedTerm> => {
  const found: Array<AvoidedTerm> = [];
  let preferred = "";
  for (const line of glossary.split("\n")) {
    const trimmed = line.trim();
    Option.map(Option.fromNullishOr(termLine.exec(trimmed)?.[1]), (term) => {
      preferred = term;
    });
    Option.map(Option.fromNullishOr(avoidLine.exec(trimmed)?.[1]), (list) => {
      for (const entry of list.split(",")) {
        const words = wordsOf(entry);
        if (words.length > 0) found.push({ words, preferred });
      }
    });
  }
  return found;
};

/** Whether `words` holds `term` as consecutive words. */
const containsTerm = (words: ReadonlyArray<string>, term: ReadonlyArray<string>): boolean =>
  words.some((_, start) => term.every((word, offset) => words[start + offset] === word));

const declaringParents: ReadonlySet<string> = new Set([
  "VariableDeclarator",
  "FunctionDeclaration",
  "FunctionExpression",
  "ClassDeclaration",
  "ClassExpression",
  "TSInterfaceDeclaration",
  "TSTypeAliasDeclaration",
  "TSEnumDeclaration",
  "TSEnumMember",
]);
const memberParents: ReadonlySet<string> = new Set([
  "TSPropertySignature",
  "TSMethodSignature",
  "MethodDefinition",
  "PropertyDefinition",
]);

/** Whether an identifier is a name this file declares, not a use or an import. */
const isDeclaredName = (node: ESTree.Node): boolean =>
  Option.exists(Option.fromNullishOr(node.parent), (parent) => {
    if (isFunction(parent) && parent.params.some((param) => param === node)) return true;
    if (declaringParents.has(parent.type)) {
      return "id" in parent && parent.id === node;
    }
    if (memberParents.has(parent.type)) {
      return "key" in parent && parent.key === node;
    }
    if (parent.type === "AssignmentPattern") return parent.left === node;
    if (parent.type === "RestElement" || parent.type === "ArrayPattern") return true;
    if (parent.type === "Property") {
      const inPattern = parent.parent?.type === "ObjectPattern" && parent.value === node;
      const ownKey =
        parent.parent?.type === "ObjectExpression" && parent.key === node && !parent.computed;
      return inPattern || ownKey;
    }
    return false;
  });

const glossaries = new Map<string, ReadonlyArray<AvoidedTerm>>();

/** The glossary's avoided terms, read once per path; an unreadable glossary has none. */
const glossaryAt = (path: string): ReadonlyArray<AvoidedTerm> =>
  Option.getOrElse(Option.fromNullishOr(glossaries.get(path)), () => {
    const terms = Effect.runSync(
      Effect.match(
        Effect.try(() => readFileSync(path, "utf8")),
        { onFailure: () => [], onSuccess: avoidedTerms },
      ),
    );
    glossaries.set(path, terms);
    return terms;
  });

export const glossaryTerms = Rule.define({
  name: "glossary-terms",
  meta: Rule.meta({
    type: "suggestion",
    description: "Name things with the glossary's terms, not the words its _Avoid_ lists name.",
    docs: { recommended: false, preset: "skills-domain" },
    schema: [
      {
        type: "object",
        properties: { glossary: { type: "string" } },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{}],
  }),
  options: Options,
  create: function* (options) {
    const ctx = yield* RuleContext;
    const terms = Option.match(Option.fromNullishOr(options?.glossary), {
      onNone: () => [],
      onSome: (path) => glossaryAt(resolve(ctx.cwd, path)),
    });
    const findings = (program: ESTree.Program) => {
      const found: Array<{
        readonly node: ESTree.Node;
        readonly name: string;
        readonly term: AvoidedTerm;
      }> = [];
      if (terms.length === 0) return found;
      walk(program, (node) => {
        if (node.type !== "Identifier" || !isDeclaredName(node)) return true;
        const words = wordsOf(node.name);
        Option.map(
          Arr.findFirst(terms, (term) => containsTerm(words, term.words)),
          (term) => found.push({ node, name: node.name, term }),
        );
        return true;
      });
      return found;
    };
    return {
      Program: (program: ESTree.Program) =>
        Effect.forEach(
          findings(program),
          ({ node, name, term }) =>
            ctx.report(
              Diagnostic.make({
                node,
                message: `\`${name}\` uses "${term.words.join(" ")}", which the glossary lists under _Avoid_ for **${term.preferred}**, so the code and the domain's language drift apart. Rename it with the glossary's term (${term.preferred}).`,
              }),
            ),
          { discard: true },
        ),
    };
  },
});

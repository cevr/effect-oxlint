/**
 * Repeated Switches (Refactoring): one discriminant branched on over the same
 * cases in several places in a file.
 *
 * Counted: `switch` statements; else-if chains and runs of adjacent guard
 * `if`s that compare one expression with literals or enum-like members
 * (`Kind.Ready`); and ternary chains of such comparisons. The discriminant is
 * matched by source text, and an occurrence counts only when it shares at
 * least `minSharedCases` (default 2) cases with another, since the same text
 * can name different unions in different functions. Reported when
 * `minOccurrences` (default 2) such places remain. Test code is skipped unless
 * `ignoreTests: false`. Ported from K-Mistele/anti-slop
 * (`martinfowler/repeated-switches`, b7c1619, MIT; THIRD_PARTY_NOTICES.md).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { ancestorsOf, unwrap } from "./_anti-slop-effect.js";
import { isTestModule, skipFile } from "./_test-files.js";

const equalityOperators: ReadonlySet<string> = new Set(["==", "===", "!=", "!=="]);
const defaultMinOccurrences = 2;
const defaultMinSharedCases = 2;

const RepeatedSwitchesOptions = Schema.UndefinedOr(
  Schema.Struct({
    ignoreTests: Schema.optionalKey(Schema.Boolean),
    minOccurrences: Schema.optionalKey(Schema.Number),
    minSharedCases: Schema.optionalKey(Schema.Number),
  }),
);

/** A file under a test directory, beside `*.test.*` and `*.spec.*`. */
const testDirectory = /(?:^|\/)(?:__tests__|__mocks__|test|tests)\//u;

/** A literal, a template with no expressions, or an enum-like member such as `Kind.Ready`. */
const isCaseValue = (node: ESTree.Node): boolean => {
  const value = unwrap(node);
  if (value.type === "Literal") return true;
  if (value.type === "TemplateLiteral") return value.expressions.length === 0;
  return (
    value.type === "MemberExpression" &&
    !value.computed &&
    value.object.type === "Identifier" &&
    /^[A-Z]/u.test(value.object.name)
  );
};

/** One expression compared with case values. */
interface Comparison {
  readonly value: string;
  readonly cases: ReadonlyArray<string>;
}

/** One place that branches on a discriminant, with the cases it names. */
interface Occurrence {
  readonly node: ESTree.Node;
  readonly cases: ReadonlySet<string>;
}

const sharedCount = (left: ReadonlySet<string>, right: ReadonlySet<string>): number =>
  [...left].filter((value) => right.has(value)).length;

const truncate = (text: string, max: number): string => {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
};

export const repeatedSwitches = Rule.define({
  name: "repeated-switches",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Disallow branching on one discriminant over the same cases in several places in a file (Refactoring, Repeated Switches).",
    schema: [
      {
        type: "object",
        properties: {
          ignoreTests: { type: "boolean" },
          minOccurrences: { type: "integer", minimum: 2 },
          minSharedCases: { type: "integer", minimum: 1 },
        },
        additionalProperties: false,
      },
    ],
    defaultOptions: [
      {
        ignoreTests: true,
        minOccurrences: defaultMinOccurrences,
        minSharedCases: defaultMinSharedCases,
      },
    ],
  }),
  options: RepeatedSwitchesOptions,
  create: function* (options) {
    const ctx = yield* RuleContext;
    const isTest = isTestModule(ctx) || testDirectory.test(ctx.filename.replaceAll("\\", "/"));
    if (options?.ignoreTests !== false && isTest) return skipFile;
    const minOccurrences = options?.minOccurrences ?? defaultMinOccurrences;
    const minSharedCases = options?.minSharedCases ?? defaultMinSharedCases;
    const occurrences = new Map<string, Array<Occurrence>>();

    const text = (node: ESTree.Node) => ctx.sourceCode.getText(node).replaceAll(/\s+/gu, " ");

    const comparedSide = (
      test: Extract<ESTree.Node, { type: "BinaryExpression" }>,
    ): Option.Option<Comparison> => {
      if (test.left.type === "PrivateIdentifier") return Option.none();
      const left = isCaseValue(test.left);
      const right = isCaseValue(test.right);
      if (right && !left) return Option.some({ value: text(test.left), cases: [text(test.right)] });
      if (left && !right) return Option.some({ value: text(test.right), cases: [text(test.left)] });
      return Option.none();
    };

    /** `x === A`, `A === x`, or an `||` of comparisons of one `x`. */
    const compare = (node: ESTree.Node): Option.Option<Comparison> => {
      const test = unwrap(node);
      if (test.type === "LogicalExpression" && test.operator === "||") {
        return Option.flatMap(Option.all([compare(test.left), compare(test.right)]), ([l, r]) => {
          if (l.value !== r.value) return Option.none();
          return Option.some({ value: l.value, cases: [...l.cases, ...r.cases] });
        });
      }
      if (test.type !== "BinaryExpression" || !equalityOperators.has(test.operator)) {
        return Option.none();
      }
      return comparedSide(test);
    };

    const record = (value: string, node: ESTree.Node, cases: ReadonlyArray<string>) => {
      const entries = occurrences.get(value) ?? [];
      entries.push({ node, cases: new Set(cases) });
      occurrences.set(value, entries);
    };

    /** The cases of an else-if chain over `first`'s value, and its length. */
    const ifChain = (statement: ESTree.IfStatement, first: Comparison) => {
      const cases = [...first.cases];
      let length = 1;
      let alternate = Option.fromNullishOr(statement.alternate);
      while (Option.isSome(alternate) && alternate.value.type === "IfStatement") {
        const next = alternate.value;
        const compared = compare(next.test);
        if (!Option.exists(compared, (other) => other.value === first.value)) break;
        cases.push(...Option.match(compared, { onNone: () => [], onSome: (other) => other.cases }));
        length += 1;
        alternate = Option.fromNullishOr(next.alternate);
      }
      return { cases, length };
    };

    /** Record each else-if chain, and each run of adjacent guard `if`s, over one value. */
    const recordIfRuns = (statements: ReadonlyArray<ESTree.Node>) => {
      let run: Option.Option<{ value: string; start: ESTree.Node; cases: Array<string> }> =
        Option.none();
      let runLength = 0;
      const flush = () => {
        if (Option.isSome(run) && runLength >= 2) {
          record(run.value.value, run.value.start, run.value.cases);
        }
        run = Option.none();
        runLength = 0;
      };
      for (const statement of statements) {
        if (statement.type !== "IfStatement") {
          flush();
          continue;
        }
        const first = compare(statement.test);
        if (Option.isNone(first)) {
          flush();
          continue;
        }
        const chain = ifChain(statement, first.value);
        if (chain.length >= 2) {
          flush();
          record(first.value.value, statement, chain.cases);
          continue;
        }
        if (statement.alternate) {
          flush();
          continue;
        }
        if (!Option.exists(run, (current) => current.value === first.value.value)) {
          flush();
          run = Option.some({ value: first.value.value, start: statement, cases: [] });
        }
        Option.map(run, (current) => current.cases.push(...chain.cases));
        runLength += 1;
      }
      flush();
    };

    const report = (expression: string, count: number) => (entry: Occurrence) =>
      ctx.report(
        Diagnostic.make({
          node: entry.node,
          message: `This file branches on \`${truncate(expression, 60)}\` over the same cases in ${String(count)} places, so adding a case means finding and editing every one of them. Model the cases as a \`Data.TaggedEnum\` (or \`Schema.TaggedUnion\`) and handle them in one exhaustive \`Match.type\`/\`Match.tags\` … \`Match.exhaustive\`, or move each case's behavior onto its variant.`,
        }),
      );

    /** The occurrences that share enough cases with another, per discriminant. */
    const repeated = (entries: ReadonlyArray<Occurrence>): ReadonlyArray<Occurrence> =>
      entries.filter((entry) =>
        entries.some(
          (other) => other !== entry && sharedCount(entry.cases, other.cases) >= minSharedCases,
        ),
      );

    return {
      SwitchStatement: (node: ESTree.SwitchStatement) => {
        const discriminant = unwrap(node.discriminant);
        if (discriminant.type === "Literal") return Effect.void;
        const cases = node.cases.flatMap((switchCase) =>
          Option.toArray(Option.map(Option.fromNullishOr(switchCase.test), text)),
        );
        record(text(discriminant), node, cases);
        return Effect.void;
      },
      ConditionalExpression: (node: ESTree.ConditionalExpression) => {
        const parent = [...ancestorsOf(node)].find((ancestor) => unwrap(ancestor) === ancestor);
        if (parent?.type === "ConditionalExpression") return Effect.void;
        Option.map(compare(node.test), (first) => {
          const cases = [...first.cases];
          let alternate = unwrap(node.alternate);
          let length = 1;
          while (alternate.type === "ConditionalExpression") {
            const next = compare(alternate.test);
            if (!Option.exists(next, (other) => other.value === first.value)) break;
            cases.push(...Option.match(next, { onNone: () => [], onSome: (other) => other.cases }));
            length += 1;
            alternate = unwrap(alternate.alternate);
          }
          if (length >= 2) record(first.value, node, cases);
        });
        return Effect.void;
      },
      Program: (node: ESTree.Program) => Effect.sync(() => recordIfRuns(node.body)),
      BlockStatement: (node: ESTree.BlockStatement) => Effect.sync(() => recordIfRuns(node.body)),
      SwitchCase: (node: ESTree.SwitchCase) => Effect.sync(() => recordIfRuns(node.consequent)),
      "Program:exit": () =>
        Effect.forEach(
          [...occurrences].flatMap(([expression, entries]) => {
            const found = repeated(entries);
            if (found.length < minOccurrences) return [];
            return found.map((entry) => [expression, found.length, entry] as const);
          }),
          ([expression, count, entry]) => report(expression, count)(entry),
          { discard: true },
        ),
    };
  },
});

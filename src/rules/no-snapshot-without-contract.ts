/**
 * A snapshot pins a contract, not an implementation's shape.
 *
 * Reported, in test modules: every snapshot matcher (`toMatchSnapshot`,
 * `toMatchInlineSnapshot`, `toThrowErrorMatchingSnapshot`, … any matcher
 * ending in `Snapshot`) unless a `contract: <reason>` comment on the lines
 * before its statement or before the case names the contract the snapshot
 * holds (a wire format, a rendered document). Which output is a contract is a
 * judgement; the comment records it. Also left alone, as output that is the
 * contract: a snapshot in a `*.golden.*` file, and a snapshot of a call's
 * result written in place (`expect(render(receipt)).toMatchSnapshot()`, the
 * printed or rendered output itself). Source: the owner's weak-test list "a
 * snapshot of implementation shape"; AGENTS.md "No golden of the lowered Go's
 * shape, unless the shape is the spec" (catalog SR-T09).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { ancestorsOf } from "./_anti-slop-effect.js";
import { contractNote, expectationsIn, statementOf, testCaseOf } from "./_test-cases.js";
import { isTestModule, skipFile } from "./_test-files.js";

const goldenFile = /\.golden\./u;

/** The snapshot of a call's result written in place: `expect(render(x)).toMatchSnapshot()`. */
const ofCallOutput = (snapshot: ESTree.CallExpression): boolean =>
  expectationsIn(snapshot).some(
    (expectation) =>
      expectation.node === snapshot &&
      Option.exists(expectation.subject, (subject) => subject.type === "CallExpression"),
  );

export const noSnapshotWithoutContract = Rule.define({
  name: "no-snapshot-without-contract",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Assert values instead of snapshots; keep a snapshot only for an output that is the contract, named in a contract: comment.",
    docs: { recommended: false, preset: "skills-tests" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (!isTestModule(ctx) || goldenFile.test(ctx.filename)) return skipFile;
    const notedBefore = (node: ESTree.Node): boolean =>
      Arr.some(ctx.sourceCode.getCommentsBefore(statementOf(node)), (comment) =>
        contractNote.test(comment.value),
      );
    const enclosingCase = (node: ESTree.Node) =>
      Arr.findFirst(ancestorsOf(node), (ancestor) => {
        if (ancestor.type !== "CallExpression") return Option.none();
        return Option.map(testCaseOf(ancestor), (testCase) => testCase.call);
      });
    return {
      CallExpression: (node: ESTree.CallExpression) => {
        const callee = node.callee;
        const snapshot =
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.property.type === "Identifier" &&
          callee.property.name.endsWith("Snapshot") &&
          expectationsIn(node).some((expectation) => expectation.node === node);
        const noted =
          notedBefore(node) || Option.exists(enclosingCase(node), (call) => notedBefore(call));
        if (!snapshot || noted || ofCallOutput(node)) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message:
              "A snapshot pins whatever the code produces today, so it fails on every refactor and passes a wrong value once someone updates it. Assert the values the case is about (`expect(await run(query)).toEqual([row])`); if this output is a contract (a wire format, a rendered document), say so with a `// contract: <reason>` comment above it.",
          }),
        );
      },
    };
  },
});

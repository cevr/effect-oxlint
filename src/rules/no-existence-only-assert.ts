/**
 * An assertion says what the value is, not only that it exists.
 *
 * Reported, in test modules: a case whose every expectation is
 * `toBeDefined()` or `toBeTruthy()` (also under `.resolves`). It passes for
 * any value at all, including a wrong one. `toBeInstanceOf(SomeFailure)` and
 * `toBe(true)` on a predicate say what the value is and are left alone. So
 * is a case that also calls an assertion helper (`expectCanonical(…)`,
 * `assert.equal(…)`), and an existence check on a lookup by predicate
 * (`list.find((x) => x.id === id)`), whose predicate is the assertion.
 * Source: the writing-tests checklist, the inverse of "asserts outcomes"
 * (catalog SR-T14).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { contains } from "./_anti-slop-effect.js";
import { expectationsIn, testCaseOf } from "./_test-cases.js";
import type { Expectation } from "./_test-cases.js";
import { isTestModule, skipFile } from "./_test-files.js";

const existence: ReadonlySet<string> = new Set(["toBeDefined", "toBeTruthy"]);
const lookups: ReadonlySet<string> = new Set(["find", "findLast"]);
const assertionHelper = /^(?:assert|expect[A-Z_])/u;

const propertyName = (node: ESTree.Node): string => {
  if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  return "";
};

/** A call `xs.find(predicate)`. */
const isLookup = (node: ESTree.Node): boolean =>
  node.type === "CallExpression" && lookups.has(propertyName(node.callee));

/** Another way the case asserts: a helper `expectX(…)`, `assert(…)` or `assert.x(…)`. */
const callsHelper = (node: ESTree.Node): boolean =>
  contains(node, (child) => {
    if (child.type !== "CallExpression") return false;
    const named = (callee: ESTree.Node) =>
      callee.type === "Identifier" && assertionHelper.test(callee.name);
    return named(child.callee) || (child.callee.type === "MemberExpression" && named(child.callee.object));
  });

/** The subject is a lookup by predicate, directly or through a local the case binds to one. */
const checksLookup = (fn: ESTree.Node, expectation: Expectation): boolean =>
  Option.exists(expectation.subject, (subject) => {
    if (isLookup(subject)) return true;
    if (subject.type !== "Identifier") return false;
    return contains(
      fn,
      (child) =>
        child.type === "VariableDeclarator" &&
        child.id.type === "Identifier" &&
        child.id.name === subject.name &&
        Option.exists(Option.fromNullishOr(child.init), isLookup),
    );
  });

export const noExistenceOnlyAssert = Rule.define({
  name: "no-existence-only-assert",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Assert what a value is (toEqual, toMatchObject), not only that it is defined or truthy.",
    docs: { recommended: false, preset: "skills-tests" },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (!isTestModule(ctx)) return skipFile;
    return {
      CallExpression: (node: ESTree.CallExpression) =>
        Option.match(testCaseOf(node), {
          onNone: () => Effect.void,
          onSome: (testCase) => {
            const expectations = expectationsIn(testCase.fn);
            const onlyExistence =
              expectations.length > 0 &&
              expectations.every((expectation) => existence.has(expectation.matcher)) &&
              !expectations.some((expectation) => checksLookup(testCase.fn, expectation)) &&
              !callsHelper(testCase.fn);
            if (!onlyExistence) return Effect.void;
            return ctx.report(
              Diagnostic.make({
                node,
                message:
                  "Every expectation here is `toBeDefined` or `toBeTruthy`, so the case passes for any value, a wrong one included. Assert the value the case is about: `expect(parse(text)).toEqual({ kind: \"note\", id: \"n1\" })`.",
              }),
            );
          },
        }),
    };
  },
});

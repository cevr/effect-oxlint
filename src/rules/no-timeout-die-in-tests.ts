/**
 * Fail a test's timeout with a typed error instead of a defect.
 *
 * A timeout is an expected outcome of a wait. `Effect.die("timed out
 * waiting for ...")` turns it into a defect, which a test helper running in a
 * forked fiber or a finalizer can surface as an unhandled error attributed to
 * no test, detached from the assertion that waited. A typed failure lands on
 * the test that caused it.
 *
 * Whether a die is a timeout is a statement of intent, so the rule reads the
 * message: a string, template, concatenation, or error constructor argument of
 * `Effect.die` or `Effect.dieMessage`, and the property values and elements of
 * an object or array among them (`new WaitError({ message: "..." })`), that
 * says "timed out", "timeout", "waiting for", or "gave up". Property keys and
 * spreads are not read. Dying on an impossible state, such as a missing
 * fixture, is a real defect and stays allowed.
 */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { importedNamespaces, isStaticMember, visibleNamespaces } from "./_effect-namespaces.js";
import { isTestModule, skipFile } from "./_test-files.js";

const timeoutText = /tim(?:ed|e)\s*out|timeout|waiting for|gave up/iu;

/**
 * The message text an argument spells: literals, templates, concatenations, constructor arguments, and object and array values,
 * through type-only wrappers (`as`, `satisfies`, `<T>`, `!`) and parentheses.
 */
const messageTexts = (node: ESTree.Node): ReadonlyArray<string> => {
  if (
    node.type === "ParenthesizedExpression" ||
    node.type === "TSAsExpression" ||
    node.type === "TSTypeAssertion" ||
    node.type === "TSNonNullExpression" ||
    node.type === "TSSatisfiesExpression"
  ) {
    return messageTexts(node.expression);
  }
  if (node.type === "Literal") return [node.value].filter(Predicate.isString);
  if (node.type === "TemplateLiteral") {
    return node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw);
  }
  if (node.type === "BinaryExpression" && node.operator === "+") {
    return [...messageTexts(node.left), ...messageTexts(node.right)];
  }
  if (node.type === "NewExpression" || node.type === "CallExpression") {
    return node.arguments.flatMap(messageTexts);
  }
  if (node.type === "ObjectExpression") {
    return node.properties
      .filter(isObjectProperty)
      .flatMap((property) => messageTexts(property.value));
  }
  if (node.type === "ArrayExpression") {
    return node.elements.filter(Predicate.isNotNullish).flatMap(messageTexts);
  }
  return [];
};

const isObjectProperty = (property: ESTree.ObjectPropertyKind): property is ESTree.ObjectProperty =>
  property.type === "Property";

const dieMethods = ["die", "dieMessage"];

export const noTimeoutDieInTests = Rule.define({
  name: "no-timeout-die-in-tests",
  meta: Rule.meta({
    type: "suggestion",
    description:
      "Fail a test's timeout with a typed error instead of Effect.die, so the failure lands on the test that waited.",
    docs: { recommended: false },
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (!isTestModule(ctx)) return skipFile;
    const effectNamespaces = new Set(["Effect"]);

    return {
      ImportDeclaration: (node: ESTree.ImportDeclaration) => {
        for (const name of importedNamespaces(node, "Effect", "effect/Effect")) {
          effectNamespaces.add(name);
        }
        return Effect.void;
      },
      CallExpression: (node: ESTree.CallExpression) => {
        const callee = node.callee;
        const effects = visibleNamespaces(ctx, node, effectNamespaces);
        const method = Arr.findFirst(dieMethods, (name) => isStaticMember(callee, effects, name));
        if (Option.isNone(method)) return Effect.void;
        const mentionsTimeout = node.arguments
          .flatMap(messageTexts)
          .some((text) => timeoutText.test(text));
        if (!mentionsTimeout) return Effect.void;
        return ctx.report(
          Diagnostic.make({
            node,
            message: `Effect.${method.value} on a timeout turns an expected outcome into a defect that can surface detached from the test that waited. Fail with a typed error (Effect.timeout fails with a TimeoutError; Effect.timeoutOrElse maps it to your own) so the timeout lands on that test.`,
          }),
        );
      },
    };
  },
});

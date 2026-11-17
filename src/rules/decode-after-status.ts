/**
 * An HTTP response's status is checked or classified before its body is
 * decoded as a success value.
 *
 * Reported: a body decode, `HttpClientResponse.schemaBodyJson`,
 * `HttpClientResponse.schemaJson` or `HttpClientResponse.schemaBodyUrlParams`,
 * or `.json` read from a value named `res`, `response` or `…Response`, with no
 * status check before it in the same function. A status check is a read of
 * `.status` or `.ok`, or `filterStatusOk`, `filterStatus` or `matchStatus`. A
 * client piped through `HttpClient.filterStatusOk` or `HttpClient.filterStatus`
 * anywhere in the file checks every response it returns, so such a file is not
 * reported. Exact counterpart of anti-slop's model question
 * `decode-after-status` (K-Mistele/anti-slop b7c1619, `src/jev/effect-rules.ts`).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { ancestorsOf, isFunction, unwrap, walk } from "./_anti-slop-effect.js";

const bodyDecoders: ReadonlySet<string> = new Set([
  "schemaBodyJson",
  "schemaJson",
  "schemaBodyUrlParams",
]);
const statusChecks: ReadonlySet<string> = new Set([
  "filterStatusOk",
  "filterStatus",
  "matchStatus",
]);
const statusFields: ReadonlySet<string> = new Set(["status", "ok"]);
const responseName = /^(?:res|response|\w*Response)$/u;

/** The property name of a non-computed member expression. */
const propertyName = (node: ESTree.Node): Option.Option<string> => {
  if (node.type !== "MemberExpression" || node.computed) return Option.none();
  if (node.property.type !== "Identifier") return Option.none();
  return Option.some(node.property.name);
};

/** `<object>.<property>` where the object is an identifier, as its two names. */
const namedMember = (node: ESTree.Node): Option.Option<readonly [string, string]> => {
  if (node.type !== "MemberExpression") return Option.none();
  const object = unwrap(node.object);
  if (object.type !== "Identifier") return Option.none();
  return Option.map(propertyName(node), (property) => [object.name, property] as const);
};

/** A body decode: `HttpClientResponse.schemaBodyJson` and its kin, or `response.json`. */
const isBodyDecode = (node: ESTree.Node): boolean =>
  Option.exists(
    namedMember(node),
    ([object, property]) =>
      (object === "HttpClientResponse" && bodyDecoders.has(property)) ||
      (property === "json" && responseName.test(object)),
  );

/** A status check: a `.status` or `.ok` read, or a `filterStatusOk`/`filterStatus`/`matchStatus` reference. */
const isStatusCheck = (node: ESTree.Node): boolean => {
  if (node.type === "Identifier") return statusChecks.has(node.name);
  return Option.exists(
    propertyName(node),
    (name) => statusChecks.has(name) || statusFields.has(name),
  );
};

/** `HttpClient.filterStatusOk` or `HttpClient.filterStatus`: every response of that client is checked. */
const isClientStatusFilter = (node: ESTree.Node): boolean =>
  Option.exists(
    namedMember(node),
    ([object, property]) =>
      object === "HttpClient" && (property === "filterStatusOk" || property === "filterStatus"),
  );

export const decodeAfterStatus = Rule.define({
  name: "decode-after-status",
  meta: Rule.meta({
    type: "problem",
    description:
      "Require an HTTP response's status to be checked or classified before its body is decoded as a success value.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const decodes: Array<ESTree.Node> = [];
    const checks: Array<ESTree.Node> = [];
    let clientFiltered = false;

    /** The innermost function holding `node`, or the program. */
    const scopeOf = (node: ESTree.Node): ESTree.Node =>
      Option.getOrElse(
        Option.fromUndefinedOr([...ancestorsOf(node)].find(isFunction)),
        () => ctx.sourceCode.ast,
      );

    /** Whether a status check sits inside `scope` and starts before `decode`. */
    const checkedBefore = (decode: ESTree.Node): boolean => {
      const scope = scopeOf(decode);
      return checks.some(
        (check) =>
          check.start < decode.start && check.start >= scope.start && check.end <= scope.end,
      );
    };

    return {
      Program: (program: ESTree.Program) =>
        Effect.sync(() =>
          walk(program, (node) => {
            if (isClientStatusFilter(node)) clientFiltered = true;
            if (isBodyDecode(node)) decodes.push(node);
            else if (isStatusCheck(node)) checks.push(node);
            return true;
          }),
        ),
      "Program:exit": () => {
        if (clientFiltered) return Effect.void;
        return Effect.forEach(
          decodes.filter((decode) => !checkedBefore(decode)),
          (decode) =>
            ctx.report(
              Diagnostic.make({
                node: decode,
                message: `\`${ctx.sourceCode.getText(decode)}\` decodes the body before the response's status is checked, so an error response is read as a success value and fails as a decode error that hides the status. Check or classify the status first: pipe the client or response through \`filterStatusOk\`, or branch with \`HttpClientResponse.matchStatus\` and decode the success schema only on the success branch.`,
              }),
            ),
          { discard: true },
        );
      },
    };
  },
});

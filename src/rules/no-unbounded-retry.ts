/** Require an explicit bound on retry schedules. */
import type { ESTree } from "@oxlint/plugins";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import { expressionArgument, staticProperties } from "./_call-arguments.js";
import {
  importedNamespaces,
  isStaticCall,
  isStaticMember,
  visibleNamespaces,
} from "./_effect-namespaces.js";

const unboundedConstructors = new Set(["exponential", "fibonacci", "spaced"]);
const boundedCombinators = new Set(["take"]);

const staticPropertyName = (node: ESTree.Expression): Option.Option<string> => {
  if (node.type !== "MemberExpression" || node.computed || node.property.type !== "Identifier") {
    return Option.none();
  }
  return Option.some(node.property.name);
};

const isBoundedOperation = (
  node: ESTree.Argument,
  scheduleNamespaces: ReadonlySet<string>,
): boolean => {
  if (node.type !== "CallExpression" || node.callee.type === "Super") return false;
  const callee = node.callee;
  const isBoundedCombinator = Option.exists(
    staticPropertyName(callee),
    (property) =>
      boundedCombinators.has(property) && isStaticMember(callee, scheduleNamespaces, property),
  );
  if (isBoundedCombinator) return true;
  if (!isStaticMember(callee, scheduleNamespaces, "both")) return false;
  return Option.exists(expressionArgument(node, 0), (bound) =>
    isStaticCall(bound, scheduleNamespaces, "recurs"),
  );
};

const unboundedSchedule = (
  node: ESTree.Expression,
  scheduleNamespaces: ReadonlySet<string>,
): Option.Option<ESTree.Node> => {
  if (node.type === "MemberExpression" && isStaticMember(node, scheduleNamespaces, "forever")) {
    return Option.some(node);
  }
  if (node.type !== "CallExpression" || node.callee.type === "Super") return Option.none();
  const callee = node.callee;
  const property = staticPropertyName(callee);
  const isUnboundedConstructor = Option.exists(
    property,
    (name) => unboundedConstructors.has(name) && isStaticMember(callee, scheduleNamespaces, name),
  );
  if (isUnboundedConstructor) return Option.some(node);
  if (!Option.contains(property, "pipe") || callee.type !== "MemberExpression") {
    return Option.none();
  }
  return Option.filter(
    unboundedSchedule(callee.object, scheduleNamespaces),
    () => !node.arguments.some((operation) => isBoundedOperation(operation, scheduleNamespaces)),
  );
};

/** Arguments a data-last retry call takes; one more means the data-first form. */
const retryArity = (
  callee: ESTree.Expression,
  effectNamespaces: ReadonlySet<string>,
  streamNamespaces: ReadonlySet<string>,
  httpClientNamespaces: ReadonlySet<string>,
): Option.Option<number> => {
  if (isStaticMember(callee, effectNamespaces, "retryOrElse")) return Option.some(2);
  if (
    isStaticMember(callee, effectNamespaces, "retry") ||
    isStaticMember(callee, streamNamespaces, "retry") ||
    isStaticMember(callee, httpClientNamespaces, "retryTransient")
  ) {
    return Option.some(1);
  }
  return Option.none();
};

/** The policy argument: first in the data-last form, second in the data-first form. */
const policyArgument = (
  node: ESTree.CallExpression,
  arity: number,
): Option.Option<ESTree.Argument> => {
  if (node.arguments.length < arity) return Option.none();
  let policyIndex = 1;
  if (node.arguments.length === arity) policyIndex = 0;
  return Arr.get(node.arguments, policyIndex);
};

/** The schedule a policy argument retries on, unless it sets `times`. */
const policySchedule = (policy: ESTree.Argument): Option.Option<ESTree.Expression> => {
  if (policy.type === "SpreadElement") return Option.none();
  if (policy.type !== "ObjectExpression") return Option.some(policy);
  if (Arr.isReadonlyArrayNonEmpty(staticProperties(policy, "times"))) return Option.none();
  return Option.map(Arr.head(staticProperties(policy, "schedule")), (property) => property.value);
};

const retryPolicy = (
  node: ESTree.CallExpression,
  effectNamespaces: ReadonlySet<string>,
  streamNamespaces: ReadonlySet<string>,
  httpClientNamespaces: ReadonlySet<string>,
): Option.Option<ESTree.Expression> => {
  if (node.callee.type === "Super") return Option.none();
  const arity = retryArity(node.callee, effectNamespaces, streamNamespaces, httpClientNamespaces);
  return Option.flatMap(
    Option.flatMap(arity, (count) => policyArgument(node, count)),
    policySchedule,
  );
};

export const noUnboundedRetry = Rule.define({
  name: "no-unbounded-retry",
  meta: Rule.meta({
    type: "problem",
    description: "Require retry policies to have an explicit attempt or duration bound.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    const effectNamespaces = new Set(["Effect"]);
    const httpClientNamespaces = new Set(["HttpClient"]);
    const scheduleNamespaces = new Set(["Schedule"]);
    const streamNamespaces = new Set(["Stream"]);

    return {
      ImportDeclaration: (node) => {
        if (node.type !== "ImportDeclaration") return Effect.void;
        for (const name of importedNamespaces(node, "Effect", "effect/Effect")) {
          effectNamespaces.add(name);
        }
        for (const name of importedNamespaces(
          node,
          "HttpClient",
          "effect/unstable/http/HttpClient",
        )) {
          httpClientNamespaces.add(name);
        }
        for (const name of importedNamespaces(node, "Schedule", "effect/Schedule")) {
          scheduleNamespaces.add(name);
        }
        for (const name of importedNamespaces(node, "Stream", "effect/Stream")) {
          streamNamespaces.add(name);
        }
        return Effect.void;
      },
      CallExpression: (node) => {
        if (node.type !== "CallExpression") return Effect.void;
        const policy = retryPolicy(
          node,
          visibleNamespaces(ctx, node, effectNamespaces),
          visibleNamespaces(ctx, node, streamNamespaces),
          visibleNamespaces(ctx, node, httpClientNamespaces),
        );
        const unbounded = Option.flatMap(policy, (schedule) =>
          unboundedSchedule(schedule, visibleNamespaces(ctx, node, scheduleNamespaces)),
        );
        return Option.match(unbounded, {
          onNone: () => Effect.void,
          onSome: (schedule) =>
            ctx.report(
              Diagnostic.make({
                node: schedule,
                message:
                  "Bound retry attempts or elapsed time. Add times or compose the schedule with Schedule.recurs or Schedule.take.",
              }),
            ),
        });
      },
    };
  },
});

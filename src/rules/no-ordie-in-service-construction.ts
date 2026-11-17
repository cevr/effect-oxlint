/**
 * Service construction failures stay typed: no `Effect.orDie` while a service
 * is built, and no `Layer.orDie` anywhere.
 *
 * Construction is a Context.Service class's `make` (in its options or as a
 * static member), its static `layer*` members, and the arguments of
 * `Layer.effect`, `Layer.scoped` and `Layer.unwrap*`. It stops at operation
 * boundaries: functions other than yielded Effect.gen generators and
 * suspend/sync thunks, Effect.fn definitions, object-literal properties (the
 * service's operations), and effects a generator defines without yielding.
 * Test files are skipped. Ported from K-Mistele/anti-slop
 * (`no-ordie-in-service-construction`, b7c1619, MIT; THIRD_PARTY_NOTICES.md).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { Diagnostic, Rule, RuleContext } from "../vendor/effect-oxlint/index.js";
import {
  effectModuleNames,
  isFunction,
  isServiceClassNode,
  keyName,
  moduleCall,
  moduleMember,
} from "./_anti-slop-effect.js";
import type { EffectModuleNames } from "./_anti-slop-effect.js";
import { isTestModule, skipFile } from "./_test-files.js";

const orDieMembers: ReadonlySet<string> = new Set(["orDie", "orDieWith"]);
/** Effect constructors whose function argument runs as part of the surrounding construction. */
const transparentThunks: ReadonlySet<string> = new Set(["suspend", "sync"]);
/** Effect constructors that define an operation, run when it is called. */
const operationConstructors: ReadonlySet<string> = new Set(["fn", "fnUntraced"]);

const isLayerMemberName = (name: string): boolean =>
  name === "layer" || /^layer[A-Z0-9_]/u.test(name);

const isLayerConstructor = (name: string): boolean =>
  name === "effect" || name === "scoped" || name.startsWith("unwrap");

/** A static `make` or `layer*` member of a service class whose value is `child`. */
const isServiceMember = (
  node: ESTree.PropertyDefinition | ESTree.MethodDefinition,
  child: ESTree.Node,
  names: EffectModuleNames,
): boolean =>
  node.static &&
  !node.computed &&
  node.value === child &&
  Option.exists(keyName(node.key), (name) => name === "make" || isLayerMemberName(name)) &&
  Option.exists(Option.fromNullishOr(node.parent.parent), (owner) =>
    isServiceClassNode(owner, names),
  );

/** The `make` property of a service class's options, whose value is `child`. */
const isOptionsMake = (
  node: Extract<ESTree.Node, { type: "Property" }>,
  child: ESTree.Node,
  names: EffectModuleNames,
): boolean => {
  if (node.computed || node.value !== child) return false;
  if (!Option.contains(keyName(node.key), "make")) return false;
  const options = node.parent;
  const superCall = options?.parent;
  return (
    options?.type === "ObjectExpression" &&
    superCall?.type === "CallExpression" &&
    Option.exists(Option.fromNullishOr(superCall.parent), (owner) =>
      isServiceClassNode(owner, names),
    )
  );
};

/** Whether `node`, entered from `child`, is where a service is constructed. */
const isConstructionRoot = (
  node: ESTree.Node,
  child: ESTree.Node,
  names: EffectModuleNames,
): boolean => {
  if (node.type === "PropertyDefinition" || node.type === "MethodDefinition") {
    return isServiceMember(node, child, names);
  }
  if (node.type === "Property") return isOptionsMake(node, child, names);
  if (node.type === "CallExpression" && node.arguments.some((argument) => argument === child)) {
    return Option.exists(moduleCall(node, names, "Layer"), isLayerConstructor);
  }
  return false;
};

/** The Effect constructor a function is passed to, such as `gen` for `Effect.gen(function* () {})`. */
const effectConstructorOf = (fn: ESTree.Node, names: EffectModuleNames): Option.Option<string> => {
  const parent = fn.parent;
  if (parent?.type !== "CallExpression") return Option.none();
  if (!parent.arguments.some((argument) => argument === fn)) return Option.none();
  return moduleCall(parent, names, "Effect");
};

/** Whether `node` is `Effect.fn(...)(...)` or `Effect.fnUntraced(...)`: an operation definition. */
const isOperationDefinition = (node: ESTree.Node, names: EffectModuleNames): boolean => {
  if (node.type !== "CallExpression") return false;
  const isOperation = (name: string) => operationConstructors.has(name);
  return (
    Option.exists(moduleCall(node, names, "Effect"), isOperation) ||
    Option.exists(moduleCall(node.callee, names, "Effect"), isOperation)
  );
};

/** What a step up from `child` to `node` means for construction. */
type Step = "construction" | "boundary" | "yield" | "generator" | "thunk" | "through";

const functionStep = (fn: ESTree.Node, names: EffectModuleNames): Step => {
  if (fn.parent && isConstructionRoot(fn.parent, fn, names)) return "construction";
  const constructor = effectConstructorOf(fn, names);
  if (Option.contains(constructor, "gen")) return "generator";
  if (Option.exists(constructor, (name) => transparentThunks.has(name))) return "thunk";
  return "boundary";
};

const step = (node: ESTree.Node, child: ESTree.Node, names: EffectModuleNames): Step => {
  if (isFunction(node)) return functionStep(node, names);
  if (isConstructionRoot(node, child, names)) return "construction";
  if (node.type === "Property" || isOperationDefinition(node, names)) return "boundary";
  if (node.type === "YieldExpression" && node.delegate) return "yield";
  return "through";
};

/** Whether `node` runs while the service is constructed. */
const isInServiceConstruction = (node: ESTree.Node, names: EffectModuleNames): boolean => {
  let child: ESTree.Node = node;
  let current = node.parent;
  let yielded = false;
  while (current) {
    const kind = step(current, child, names);
    if (kind === "construction") return true;
    if (kind === "boundary") return false;
    if (kind === "generator") {
      if (!yielded) return false;
      yielded = false;
    }
    if (kind === "yield") yielded = true;
    child = current;
    current = current.parent;
  }
  return false;
};

const layerOrDieMessage =
  "`Layer.orDie` hides this layer's construction failures as defects. Leave them in the layer's error channel as Schema.TaggedErrors and handle them where the runtime is built.";

const constructionOrDieMessage = (member: string): string =>
  `\`Effect.${member}\` turns a service construction failure into a defect. Classify the failure as a Schema.TaggedError and let it flow through the layer's error channel (\`Layer.Layer<Service, ThatError>\`), or handle it here with Effect.catchTag.`;

export const noOrdieInServiceConstruction = Rule.define({
  name: "no-ordie-in-service-construction",
  meta: Rule.meta({
    type: "problem",
    description:
      "Disallow Effect.orDie while constructing a service (its make, its static layers, or Layer.effect/scoped/unwrap arguments) and Layer.orDie anywhere.",
  }),
  create: function* () {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    const names = effectModuleNames(ctx.sourceCode.ast);
    const report = (node: ESTree.Node, message: string) =>
      ctx.report(Diagnostic.make({ node, message }));

    return {
      MemberExpression: (node: ESTree.MemberExpression) => {
        if (Option.contains(moduleMember(node, names, "Layer"), "orDie")) {
          return report(node, layerOrDieMessage);
        }
        return Option.match(
          Option.filter(
            moduleMember(node, names, "Effect"),
            (member) => orDieMembers.has(member) && isInServiceConstruction(node, names),
          ),
          {
            onNone: () => Effect.void,
            onSome: (member) => report(node, constructionOrDieMessage(member)),
          },
        );
      },
    };
  },
});

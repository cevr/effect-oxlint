/**
 * Each Context.Service owns its constructor as `make` and its layer as
 * `Layer.effect(this, this.make)`, with variant layers derived from them.
 * Opt-in: the make/layer convention is a project's policy.
 *
 * Reported: a service with layers but no `make` (a tag-only service is allowed
 * unless `allowTagOnly: false`); a `make` with no `static layer`; a `layer` not
 * built from `make`; a variant `layer*` that builds the service without
 * deriving from `make` or a layer; and a `Layer.effect` outside a service class
 * that builds a project tag from an inline constructor. Test files are
 * skipped. Ported from K-Mistele/anti-slop (`require-service-make-layer`,
 * b7c1619, MIT; THIRD_PARTY_NOTICES.md).
 */
import type { ESTree } from "@oxlint/plugins";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { Diagnostic, Rule, RuleContext, Scope } from "../vendor/effect-oxlint/index.js";
import {
  classMember,
  contains,
  effectModuleNames,
  enclosingClass,
  isFunction,
  moduleCall,
  pipeReceiver,
  returnedExpressions,
  serviceClass,
  serviceMakes,
  staticMembers,
  unwrap,
} from "./_anti-slop-effect.js";
import type { EffectModuleNames, ServiceClass, StaticMember } from "./_anti-slop-effect.js";
import { isTestModule, skipFile } from "./_test-files.js";

const RequireServiceMakeLayerOptions = Schema.UndefinedOr(
  Schema.Struct({ allowTagOnly: Schema.optionalKey(Schema.Boolean) }),
);

const isLayerMemberName = (name: string): boolean =>
  name === "layer" || /^layer[A-Z0-9_]/u.test(name);

const layerConstructors: ReadonlySet<string> = new Set(["effect", "scoped", "succeed", "sync"]);

/** `this` or the class's own name. */
const isTarget = (node: ESTree.Node, service: ServiceClass): boolean => {
  const expression = unwrap(node);
  if (expression.type === "ThisExpression") return true;
  return expression.type === "Identifier" && Option.contains(service.name, expression.name);
};

/** What a call calls, or the expression itself when it is not a call. */
const calledOrSelf = (node: ESTree.Node): ESTree.Node => {
  const expression = unwrap(node);
  if (expression.type === "CallExpression") return expression.callee;
  return expression;
};

/** `this.make`, `ClassName.make`, or a call of either. */
const isMakeReference = (node: ESTree.Node, service: ServiceClass): boolean =>
  Option.contains(classMember(calledOrSelf(node), service), "make");

/** `Layer.effect(this, this.make)`, or a call of it. */
const isLayerEffectOfMake = (
  expression: ESTree.CallExpression,
  service: ServiceClass,
  names: EffectModuleNames,
): boolean => {
  if (!Option.contains(moduleCall(expression, names, "Layer"), "effect")) return false;
  const [target, make] = expression.arguments;
  if (!target || !make) return false;
  return isTarget(target, service) && isMakeReference(make, service);
};

/** Whether `node` is `Layer.effect(this, this.make)` or a form built only from it. */
const isMakeLayer = (
  node: ESTree.Node,
  service: ServiceClass,
  names: EffectModuleNames,
): boolean => {
  const expression = unwrap(node);
  if (isFunction(expression)) {
    const returned = returnedExpressions(expression);
    return returned.length > 0 && returned.every((value) => isMakeLayer(value, service, names));
  }
  const receiver = pipeReceiver(expression);
  if (Option.isSome(receiver)) return isMakeLayer(receiver.value, service, names);
  if (expression.type === "CallExpression") {
    if (Option.exists(classMember(expression.callee, service), isLayerMemberName)) return true;
    return isLayerEffectOfMake(expression, service, names);
  }
  return Option.exists(
    classMember(expression, service),
    (sibling) => sibling !== "layer" && isLayerMemberName(sibling),
  );
};

/** Whether a static member builds this service with a Layer constructor, rather than a layer for another tag. */
const buildsService = (value: ESTree.Node, service: ServiceClass, names: EffectModuleNames) =>
  contains(
    value,
    (node) =>
      node.type === "CallExpression" &&
      Option.exists(moduleCall(node, names, "Layer"), (name) => layerConstructors.has(name)) &&
      Option.exists(Option.fromUndefinedOr(node.arguments.at(0)), (target) =>
        isTarget(target, service),
      ),
  );

/** Whether a variant layer refers to the service's make or one of its layers. */
const derivesFromService = (value: ESTree.Node, service: ServiceClass): boolean =>
  contains(value, (node) =>
    Option.exists(
      classMember(node, service),
      (member) => member === "make" || isLayerMemberName(member),
    ),
  );

/** Tags from the Effect packages, whose classes a project cannot give a make. */
const isEffectPackage = (source: string): boolean =>
  source === "effect" || source.startsWith("effect/") || source.startsWith("@effect/");

/** A finding on a service class; `member` names the variant layer, empty otherwise. */
interface Finding {
  readonly messageId: "missingMake" | "missingLayer" | "invalidLayer" | "invalidVariantLayer";
  readonly node: ESTree.Node;
  readonly member: string;
}

/** What is wrong with a service class's make and layers. */
const serviceFindings = (
  service: ServiceClass,
  names: EffectModuleNames,
  allowTagOnly: boolean,
): ReadonlyArray<Finding> => {
  const node = service.node;
  const named: ESTree.Node = Option.getOrElse(Option.fromNullishOr(node.id), () => node);
  const layers = staticMembers(node).filter((member) => isLayerMemberName(member.name));
  if (serviceMakes(service).length === 0) {
    if (allowTagOnly && layers.length === 0) return [];
    return [{ messageId: "missingMake", node: named, member: "" }];
  }
  const layer = Option.fromUndefinedOr(layers.find((member) => member.name === "layer"));
  const layerFinding = (member: StaticMember): ReadonlyArray<Finding> => {
    if (Option.exists(member.value, (value) => isMakeLayer(value, service, names))) return [];
    return [{ messageId: "invalidLayer", node: member.node, member: "" }];
  };
  const variants = layers
    .filter((member) => !Option.contains(layer, member))
    .filter((member) =>
      Option.exists(
        member.value,
        (value) => buildsService(value, service, names) && !derivesFromService(value, service),
      ),
    )
    .map((member): Finding => ({
      messageId: "invalidVariantLayer",
      node: member.node,
      member: member.name,
    }));
  const missingLayer: ReadonlyArray<Finding> = [
    { messageId: "missingLayer", node: named, member: "" },
  ];
  return [
    ...Option.match(layer, { onNone: () => missingLayer, onSome: layerFinding }),
    ...variants,
  ];
};

export const requireServiceMakeLayer = Rule.define({
  name: "require-service-make-layer",
  meta: Rule.meta({
    type: "problem",
    description:
      "Require Context.Service classes to define `make` and `static layer = Layer.effect(this, this.make)`, with variant layers derived from them.",
    docs: { recommended: false },
    messages: {
      missingMake:
        'Service "{{name}}" has layers but no `make`, so its construction lives outside the class. Add `make: Effect.gen(function* () { ...yield* dependencies...; return { ...operations } })` to its Context.Service options (or `static readonly make = (options: Options) => Effect.gen(...)` when construction needs plain options), then add `static readonly layer = Layer.effect(this, this.make)`.',
      missingLayer:
        'Service "{{name}}" has a `make` but no `static layer`, so each caller wires it by hand. Add `static readonly layer = Layer.effect(this, this.make)`, or `static readonly layer = (options: Options) => Layer.effect(this, this.make(options))` when make takes options.',
      invalidLayer:
        "`{{name}}.layer` is not built from `{{name}}.make`, so the service has two constructors. Write `static readonly layer = Layer.effect(this, this.make)` (add `.pipe(Layer.provide(...))` for local wiring), or `(options: Options) => Layer.effect(this, this.make(options))`; move any construction code into make.",
      invalidVariantLayer:
        "`{{name}}.{{member}}` does not derive from `{{name}}.layer` or `{{name}}.make`, so it is a second implementation. Write it as `{{name}}.layer.pipe(Layer.provide(...))` or `Layer.effect(this, this.make(options))`. A separate implementation belongs in its own service, or in test/ when it is a fake.",
      inlineLayerEffect:
        "This Layer.effect builds `{{service}}` from an inline constructor, outside the service class. Move the constructor into the class as `make: Effect.gen(...)`, add `static readonly layer = Layer.effect(this, this.make)`, and use `{{service}}.layer` here.",
    },
    schema: [
      {
        type: "object",
        properties: { allowTagOnly: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ allowTagOnly: true }],
  }),
  options: RequireServiceMakeLayerOptions,
  create: function* (options) {
    const ctx = yield* RuleContext;
    if (isTestModule(ctx)) return skipFile;
    const names = effectModuleNames(ctx.sourceCode.ast);
    const allowTagOnly = options?.allowTagOnly !== false;
    const text = (node: ESTree.Node) => ctx.sourceCode.getText(node);

    /** The module an expression's root identifier is imported from. */
    const importSource = (node: ESTree.Node): Option.Option<string> => {
      let root = unwrap(node);
      while (root.type === "MemberExpression") root = unwrap(root.object);
      if (root.type !== "Identifier") return Option.none();
      return Option.flatMap(
        Scope.findVariableUp(ctx.sourceCode.getScope(root), root.name),
        (variable) => {
          const definition = variable.defs.at(0);
          if (definition?.type !== "ImportBinding") return Option.none();
          const declaration = definition.parent;
          if (declaration?.type !== "ImportDeclaration") return Option.none();
          return Option.some(declaration.source.value);
        },
      );
    };

    /** `X.make` or `X.make(...)` where `X` has the same text as the layer target. */
    const isTargetMake = (target: ESTree.Node, make: ESTree.Node): boolean => {
      const reference = unwrap(calledOrSelf(make));
      return (
        reference.type === "MemberExpression" &&
        !reference.computed &&
        reference.property.type === "Identifier" &&
        reference.property.name === "make" &&
        text(reference.object) === text(unwrap(target))
      );
    };

    const checkClass = (node: ESTree.Class) =>
      Option.match(serviceClass(node, names), {
        onNone: () => Effect.void,
        onSome: (service) => {
          const name = Option.getOrElse(service.name, () => "this service");
          return Effect.forEach(
            serviceFindings(service, names, allowTagOnly),
            (finding) =>
              ctx.report(
                Diagnostic.fromId({
                  node: finding.node,
                  messageId: finding.messageId,
                  data: { name, member: finding.member },
                }),
              ),
            { discard: true },
          );
        },
      });

    /** Whether a `Layer.effect` call builds a project tag from an inline constructor. */
    const isInlineLayerEffect = (node: ESTree.CallExpression): boolean => {
      if (!Option.contains(moduleCall(node, names, "Layer"), "effect")) return false;
      if (
        Option.isSome(Option.flatMap(enclosingClass(node), (owner) => serviceClass(owner, names)))
      ) {
        return false;
      }
      const [target, make] = node.arguments;
      if (!target || !make || target.type === "SpreadElement" || make.type === "SpreadElement") {
        return false;
      }
      return !isTargetMake(target, make) && !Option.exists(importSource(target), isEffectPackage);
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
      CallExpression: (node: ESTree.CallExpression) => {
        if (!isInlineLayerEffect(node)) return Effect.void;
        const target = node.arguments.at(0);
        return ctx.report(
          Diagnostic.fromId({
            node,
            messageId: "inlineLayerEffect",
            data: {
              service: Option.match(Option.fromUndefinedOr(target), {
                onNone: () => "",
                onSome: (expression) => text(unwrap(expression)),
              }),
            },
          }),
        );
      },
    };
  },
});
